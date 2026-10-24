"! Money arithmetic for planning values, in integer minor units of each currency (cents, yen,
"! fils), so that every step is exact on any ABAP runtime.
"! SAP stores CURR amounts with two decimals whatever the currency: the internal value times 100
"! is the amount in minor units. Conversion uses an explicit rate snapshot and rounds once, half
"! away from zero; a converted parent is always the sum of its converted leaves.
CLASS zcl_pln_money DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_minor TYPE p LENGTH 16 DECIMALS 0.
    TYPES ty_internal TYPE p LENGTH 12 DECIMALS 2.
    TYPES ty_decimal TYPE p LENGTH 16 DECIMALS 6.

    TYPES:
      BEGIN OF ty_rate,
        "! Units of target currency per from_factor units of source currency, up to 9 decimals.
        rate        TYPE p LENGTH 12 DECIMALS 9,
        from_factor TYPE i,
        to_factor   TYPE i,
      END OF ty_rate.

    TYPES tt_minor TYPE STANDARD TABLE OF ty_minor WITH EMPTY KEY.

    "! Round half away from zero to iv_decimals places (0..6): ABAP commercial rounding, Excel ROUND.
    CLASS-METHODS round_commercial
      IMPORTING iv_value        TYPE ty_decimal
                iv_decimals     TYPE i
      RETURNING VALUE(rv_value) TYPE ty_decimal
      RAISING   zcx_pln_error.

    "! Amount in currency units -> minor units; rejects more decimals than the currency has.
    CLASS-METHODS to_minor
      IMPORTING iv_amount            TYPE ty_decimal
                iv_currency_decimals TYPE i
      RETURNING VALUE(rv_minor)      TYPE ty_minor
      RAISING   zcx_pln_error.

    CLASS-METHODS from_minor
      IMPORTING iv_minor             TYPE ty_minor
                iv_currency_decimals TYPE i
      RETURNING VALUE(rv_amount)     TYPE ty_decimal
      RAISING   zcx_pln_error.

    "! Minor units -> SAP internal CURR format (and back): internal = minor / 100.
    CLASS-METHODS to_internal
      IMPORTING iv_minor           TYPE ty_minor
      RETURNING VALUE(rv_internal) TYPE ty_internal.

    CLASS-METHODS from_internal
      IMPORTING iv_internal     TYPE ty_internal
      RETURNING VALUE(rv_minor) TYPE ty_minor.

    "! Convert minor units of the source currency into minor units of the target currency.
    CLASS-METHODS convert
      IMPORTING iv_minor           TYPE ty_minor
                iv_source_decimals TYPE i
                iv_target_decimals TYPE i
                is_rate            TYPE ty_rate
      RETURNING VALUE(rv_minor)    TYPE ty_minor
      RAISING   zcx_pln_error.

    "! Convert every leaf with the same rate snapshot; the parent is the sum of converted leaves.
    CLASS-METHODS convert_and_sum
      IMPORTING it_leaves          TYPE tt_minor
                iv_source_decimals TYPE i
                iv_target_decimals TYPE i
                is_rate            TYPE ty_rate
      RETURNING VALUE(rv_parent)   TYPE ty_minor
      RAISING   zcx_pln_error.

  PRIVATE SECTION.
    CONSTANTS c_limit TYPE ty_minor VALUE '9999999999999999999999999999999'.

    CLASS-METHODS pow10
      IMPORTING iv_exponent     TYPE i
      RETURNING VALUE(rv_power) TYPE ty_minor.

    CLASS-METHODS check_decimals
      IMPORTING iv_decimals TYPE i
      RAISING   zcx_pln_error.

    "! Integer quotient rounded half away from zero; iv_denominator must be positive.
    CLASS-METHODS divide_commercial
      IMPORTING iv_numerator       TYPE ty_minor
                iv_denominator     TYPE ty_minor
      RETURNING VALUE(rv_quotient) TYPE ty_minor.

    CLASS-METHODS multiply_checked
      IMPORTING iv_a              TYPE ty_minor
                iv_b              TYPE ty_minor
      RETURNING VALUE(rv_product) TYPE ty_minor
      RAISING   zcx_pln_error.
ENDCLASS.


CLASS zcl_pln_money IMPLEMENTATION.

  METHOD round_commercial.
    check_decimals( iv_decimals ).
    DATA(lv_scaled) = CONV ty_minor( iv_value * pow10( 6 ) ).
    DATA(lv_step) = pow10( 6 - iv_decimals ).
    rv_value = divide_commercial( iv_numerator = lv_scaled iv_denominator = lv_step ) * lv_step / pow10( 6 ).
  ENDMETHOD.


  METHOD to_minor.
    check_decimals( iv_currency_decimals ).
    IF round_commercial( iv_value = iv_amount iv_decimals = iv_currency_decimals ) <> iv_amount.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-invalid_decimals ).
    ENDIF.
    rv_minor = iv_amount * pow10( iv_currency_decimals ).
  ENDMETHOD.


  METHOD from_minor.
    check_decimals( iv_currency_decimals ).
    rv_amount = iv_minor / pow10( iv_currency_decimals ).
  ENDMETHOD.


  METHOD to_internal.
    rv_internal = iv_minor / 100.
  ENDMETHOD.


  METHOD from_internal.
    rv_minor = iv_internal * 100.
  ENDMETHOD.


  METHOD convert.
    check_decimals( iv_source_decimals ).
    check_decimals( iv_target_decimals ).
    IF is_rate-rate <= 0 OR is_rate-from_factor <= 0 OR is_rate-to_factor <= 0.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-invalid_rate ).
    ENDIF.
    " target minor = minor * rate * to_factor * 10^dt / ( 10^ds * from_factor ), rate scaled by 10^9
    DATA(lv_rate_scaled) = CONV ty_minor( is_rate-rate * pow10( 9 ) ).
    DATA(lv_numerator) = multiply_checked( iv_a = iv_minor iv_b = lv_rate_scaled ).
    lv_numerator = multiply_checked( iv_a = lv_numerator iv_b = CONV #( is_rate-to_factor ) ).
    lv_numerator = multiply_checked( iv_a = lv_numerator iv_b = pow10( iv_target_decimals ) ).
    DATA(lv_denominator) = CONV ty_minor( pow10( iv_source_decimals ) * pow10( 9 ) * is_rate-from_factor ).
    rv_minor = divide_commercial( iv_numerator = lv_numerator iv_denominator = lv_denominator ).
  ENDMETHOD.


  METHOD convert_and_sum.
    LOOP AT it_leaves INTO DATA(lv_leaf).
      rv_parent = rv_parent + convert( iv_minor           = lv_leaf
                                       iv_source_decimals = iv_source_decimals
                                       iv_target_decimals = iv_target_decimals
                                       is_rate            = is_rate ).
    ENDLOOP.
  ENDMETHOD.


  METHOD pow10.
    rv_power = 1.
    DO iv_exponent TIMES.
      rv_power = rv_power * 10.
    ENDDO.
  ENDMETHOD.


  METHOD check_decimals.
    IF iv_decimals < 0 OR iv_decimals > 6.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-invalid_decimals ).
    ENDIF.
  ENDMETHOD.


  METHOD divide_commercial.
    DATA(lv_abs) = CONV ty_minor( abs( iv_numerator ) ).
    rv_quotient = lv_abs DIV iv_denominator.
    IF ( lv_abs MOD iv_denominator ) * 2 >= iv_denominator.
      rv_quotient = rv_quotient + 1.
    ENDIF.
    IF iv_numerator < 0.
      rv_quotient = 0 - rv_quotient.
    ENDIF.
  ENDMETHOD.


  METHOD multiply_checked.
    IF iv_a <> 0 AND abs( iv_b ) > c_limit DIV abs( iv_a ).
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-overflow ).
    ENDIF.
    rv_product = iv_a * iv_b.
  ENDMETHOD.

ENDCLASS.

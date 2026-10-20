CLASS zcx_pln_error DEFINITION
  PUBLIC
  INHERITING FROM cx_static_check
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF reasons,
        negative_weight      TYPE string VALUE `NEGATIVE_WEIGHT`,
        no_driver            TYPE string VALUE `NO_DRIVER`,
        all_locked           TYPE string VALUE `ALL_LOCKED`,
        below_locked_total   TYPE string VALUE `BELOW_LOCKED_TOTAL`,
        unknown_node         TYPE string VALUE `UNKNOWN_NODE`,
        hierarchy_cycle      TYPE string VALUE `HIERARCHY_CYCLE`,
        invalid_decimals     TYPE string VALUE `INVALID_DECIMALS`,
        invalid_rate         TYPE string VALUE `INVALID_RATE`,
        overflow             TYPE string VALUE `OVERFLOW`,
      END OF reasons.

    DATA reason TYPE string READ-ONLY.

    METHODS constructor
      IMPORTING
        reason   TYPE string OPTIONAL
        previous TYPE REF TO cx_root OPTIONAL.
ENDCLASS.


CLASS zcx_pln_error IMPLEMENTATION.

  METHOD constructor ##ADT_SUPPRESS_GENERATION.
    super->constructor( previous = previous ).
    me->reason = reason.
  ENDMETHOD.

ENDCLASS.

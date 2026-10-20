"! Conserving allocation, spreading and top-down disaggregation in minor currency units.
"! Every result sums exactly to the requested total, never changes a locked value, is within
"! one minor unit of the exact proportional share, does not depend on input row order, and a
"! reversal (negative total) cancels the original leaf by leaf.
CLASS zcl_pln_allocator DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    TYPES ty_amount TYPE p LENGTH 16 DECIMALS 0.

    TYPES:
      BEGIN OF ty_share,
        key    TYPE string,
        amount TYPE ty_amount,
      END OF ty_share,
      tt_share TYPE STANDARD TABLE OF ty_share WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_leaf,
        key    TYPE string,
        value  TYPE ty_amount,
        locked TYPE abap_bool,
      END OF ty_leaf,
      tt_leaf TYPE STANDARD TABLE OF ty_leaf WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_period,
        key    TYPE string,
        weight TYPE ty_amount,
        value  TYPE ty_amount,
        locked TYPE abap_bool,
      END OF ty_period,
      tt_period TYPE STANDARD TABLE OF ty_period WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_node,
        key    TYPE string,
        parent TYPE string,
        value  TYPE ty_amount,
        locked TYPE abap_bool,
      END OF ty_node,
      tt_node TYPE STANDARD TABLE OF ty_node WITH EMPTY KEY.

    "! Split a signed total across non-negative weights (largest remainder, ties by key).
    "! Result rows keep the input order; the key column is copied from the input.
    CLASS-METHODS split
      IMPORTING it_weights       TYPE tt_share
                iv_total         TYPE ty_amount
      RETURNING VALUE(rt_shares) TYPE tt_share
      RAISING   zcx_pln_error.

    "! Set the total of a group of leaves. Locked leaves keep their value; the change is
    "! distributed over unlocked leaves in proportion to their current values.
    CLASS-METHODS set_total
      IMPORTING it_leaves        TYPE tt_leaf
                iv_target        TYPE ty_amount
                iv_nonnegative   TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rt_leaves) TYPE tt_leaf
      RAISING   zcx_pln_error.

    "! Spread an annual amount over periods. Locked periods keep their value; the rest of the
    "! amount is spread over the open periods by their weights (straight line = equal weights).
    CLASS-METHODS spread
      IMPORTING it_periods        TYPE tt_period
                iv_annual         TYPE ty_amount
                iv_nonnegative    TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rt_periods) TYPE tt_period
      RAISING   zcx_pln_error.

    "! Set the total of a hierarchy node. A locked node fixes its whole subtree. The change is
    "! allocated once over all eligible leaves below the node (not level by level).
    CLASS-METHODS set_node_total
      IMPORTING it_nodes        TYPE tt_node
                iv_node         TYPE string
                iv_target       TYPE ty_amount
                iv_nonnegative  TYPE abap_bool DEFAULT abap_true
      RETURNING VALUE(rt_nodes) TYPE tt_node
      RAISING   zcx_pln_error.

  PRIVATE SECTION.
    TYPES:
      BEGIN OF ty_work,
        idx TYPE i,
        key TYPE string,
        qty TYPE ty_amount,
        rem TYPE ty_amount,
      END OF ty_work,
      tt_work TYPE STANDARD TABLE OF ty_work WITH EMPTY KEY.

    CLASS-METHODS collect_leaves
      IMPORTING it_nodes  TYPE tt_node
                iv_node   TYPE string
                iv_locked TYPE abap_bool
                iv_depth  TYPE i
      CHANGING  ct_leaves TYPE tt_leaf
      RAISING   zcx_pln_error.
ENDCLASS.


CLASS zcl_pln_allocator IMPLEMENTATION.

  METHOD split.
    DATA lv_wsum TYPE ty_amount.
    DATA lt_work TYPE tt_work.

    LOOP AT it_weights INTO DATA(ls_weight).
      IF ls_weight-amount < 0.
        RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-negative_weight ).
      ENDIF.
      lv_wsum = lv_wsum + ls_weight-amount.
    ENDLOOP.

    IF lv_wsum = 0.
      IF iv_total <> 0.
        RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-no_driver ).
      ENDIF.
      rt_shares = VALUE #( FOR w IN it_weights ( key = w-key amount = 0 ) ).
      RETURN.
    ENDIF.

    " Allocate the absolute amount and re-apply the sign, so that a reversal cancels exactly.
    DATA(lv_abs) = CONV ty_amount( abs( iv_total ) ).
    DATA(lv_left) = lv_abs.
    LOOP AT it_weights INTO ls_weight.
      DATA(lv_prod) = CONV ty_amount( lv_abs * ls_weight-amount ).
      DATA(lv_qty) = CONV ty_amount( lv_prod DIV lv_wsum ).
      APPEND VALUE #( idx = sy-tabix
                      key = ls_weight-key
                      qty = lv_qty
                      rem = lv_prod - lv_qty * lv_wsum ) TO lt_work.
      lv_left = lv_left - lv_qty.
    ENDLOOP.

    " The leftover units (fewer than the number of rows) go to the largest remainders; ties
    " are broken by the member key, never by the position of the row in the input.
    DATA(lt_order) = lt_work.
    SORT lt_order BY rem DESCENDING key ASCENDING.
    LOOP AT lt_order INTO DATA(ls_order).
      IF lv_left <= 0.
        EXIT.
      ENDIF.
      lt_work[ idx = ls_order-idx ]-qty = lt_work[ idx = ls_order-idx ]-qty + 1.
      lv_left = lv_left - 1.
    ENDLOOP.

    LOOP AT lt_work INTO DATA(ls_work).
      APPEND VALUE #( key    = ls_work-key
                      amount = COND #( WHEN iv_total < 0 THEN 0 - ls_work-qty ELSE ls_work-qty ) ) TO rt_shares.
    ENDLOOP.
  ENDMETHOD.


  METHOD set_total.
    DATA lv_fixed   TYPE ty_amount.
    DATA lv_current TYPE ty_amount.
    DATA lt_weights TYPE tt_share.

    rt_leaves = it_leaves.
    LOOP AT it_leaves INTO DATA(ls_leaf).
      lv_current = lv_current + ls_leaf-value.
      IF ls_leaf-locked = abap_true.
        lv_fixed = lv_fixed + ls_leaf-value.
      ELSE.
        APPEND VALUE #( key = ls_leaf-key amount = ls_leaf-value ) TO lt_weights.
      ENDIF.
    ENDLOOP.

    DATA(lv_delta) = CONV ty_amount( iv_target - lv_current ).
    IF lv_delta = 0.
      RETURN.
    ENDIF.
    IF lt_weights IS INITIAL.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-all_locked ).
    ENDIF.
    IF iv_nonnegative = abap_true AND iv_target - lv_fixed < 0.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-below_locked_total ).
    ENDIF.
    LOOP AT lt_weights TRANSPORTING NO FIELDS WHERE amount < 0.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-negative_weight ).
    ENDLOOP.

    DATA(lt_shares) = split( it_weights = lt_weights iv_total = lv_delta ).
    LOOP AT lt_shares INTO DATA(ls_share).
      READ TABLE rt_leaves ASSIGNING FIELD-SYMBOL(<ls_leaf>) WITH KEY key = ls_share-key.
      <ls_leaf>-value = <ls_leaf>-value + ls_share-amount.
    ENDLOOP.
  ENDMETHOD.


  METHOD spread.
    DATA lv_fixed   TYPE ty_amount.
    DATA lt_weights TYPE tt_share.

    rt_periods = it_periods.
    LOOP AT it_periods INTO DATA(ls_period).
      IF ls_period-locked = abap_true.
        lv_fixed = lv_fixed + ls_period-value.
      ELSE.
        APPEND VALUE #( key = ls_period-key amount = ls_period-weight ) TO lt_weights.
      ENDIF.
    ENDLOOP.

    DATA(lv_residual) = CONV ty_amount( iv_annual - lv_fixed ).
    IF iv_nonnegative = abap_true AND lv_residual < 0.
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-below_locked_total ).
    ENDIF.
    IF lt_weights IS INITIAL.
      IF lv_residual <> 0.
        RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-all_locked ).
      ENDIF.
      RETURN.
    ENDIF.

    DATA(lt_shares) = split( it_weights = lt_weights iv_total = lv_residual ).
    LOOP AT lt_shares INTO DATA(ls_share).
      READ TABLE rt_periods ASSIGNING FIELD-SYMBOL(<ls_period>) WITH KEY key = ls_share-key.
      <ls_period>-value = ls_share-amount.
    ENDLOOP.
  ENDMETHOD.


  METHOD set_node_total.
    DATA lt_leaves TYPE tt_leaf.

    IF NOT line_exists( it_nodes[ key = iv_node ] ).
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-unknown_node ).
    ENDIF.

    " A locked ancestor fixes the node itself.
    DATA(lv_locked) = it_nodes[ key = iv_node ]-locked.
    DATA(lv_parent) = it_nodes[ key = iv_node ]-parent.
    DATA(lv_guard) = 0.
    WHILE lv_parent IS NOT INITIAL AND lv_locked = abap_false.
      lv_guard = lv_guard + 1.
      IF lv_guard > lines( it_nodes ).
        RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-hierarchy_cycle ).
      ENDIF.
      READ TABLE it_nodes INTO DATA(ls_ancestor) WITH KEY key = lv_parent.
      IF sy-subrc <> 0.
        EXIT.
      ENDIF.
      lv_locked = ls_ancestor-locked.
      lv_parent = ls_ancestor-parent.
    ENDWHILE.

    collect_leaves( EXPORTING it_nodes  = it_nodes
                              iv_node   = iv_node
                              iv_locked = lv_locked
                              iv_depth  = 0
                    CHANGING  ct_leaves = lt_leaves ).

    DATA(lt_result) = set_total( it_leaves      = lt_leaves
                                 iv_target      = iv_target
                                 iv_nonnegative = iv_nonnegative ).
    rt_nodes = it_nodes.
    LOOP AT lt_result INTO DATA(ls_leaf) WHERE locked = abap_false.
      READ TABLE rt_nodes ASSIGNING FIELD-SYMBOL(<ls_node>) WITH KEY key = ls_leaf-key.
      <ls_node>-value = ls_leaf-value.
    ENDLOOP.
  ENDMETHOD.


  METHOD collect_leaves.
    IF iv_depth > lines( it_nodes ).
      RAISE EXCEPTION NEW zcx_pln_error( reason = zcx_pln_error=>reasons-hierarchy_cycle ).
    ENDIF.
    DATA(ls_node) = it_nodes[ key = iv_node ].
    DATA(lv_locked) = xsdbool( iv_locked = abap_true OR ls_node-locked = abap_true ).
    DATA(lv_has_children) = abap_false.
    LOOP AT it_nodes INTO DATA(ls_child) WHERE parent = iv_node.
      lv_has_children = abap_true.
      collect_leaves( EXPORTING it_nodes  = it_nodes
                                iv_node   = ls_child-key
                                iv_locked = lv_locked
                                iv_depth  = iv_depth + 1
                      CHANGING  ct_leaves = ct_leaves ).
    ENDLOOP.
    IF lv_has_children = abap_false.
      APPEND VALUE #( key = ls_node-key value = ls_node-value locked = lv_locked ) TO ct_leaves.
    ENDIF.
  ENDMETHOD.

ENDCLASS.

CLASS ltc_allocator DEFINITION FINAL FOR TESTING
  DURATION MEDIUM
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    TYPES ty_amount TYPE zcl_pln_allocator=>ty_amount.
    DATA mv_seed TYPE ty_amount.

    METHODS split_three_equal_by_key FOR TESTING RAISING cx_static_check.
    METHODS split_reversal_cancels FOR TESTING RAISING cx_static_check.
    METHODS split_rejects_negative_weight FOR TESTING.
    METHODS split_no_driver FOR TESTING.
    METHODS set_total_keeps_locked FOR TESTING RAISING cx_static_check.
    METHODS set_total_below_locked FOR TESTING.
    METHODS set_total_all_locked FOR TESTING.
    METHODS set_total_noop_without_driver FOR TESTING RAISING cx_static_check.
    METHODS spread_with_locked_month FOR TESTING RAISING cx_static_check.
    METHODS node_total_locked_subtree FOR TESTING RAISING cx_static_check.
    METHODS node_total_detects_cycle FOR TESTING.
    METHODS property_random_splits FOR TESTING RAISING cx_static_check.
    METHODS differential_split FOR TESTING RAISING cx_static_check.
    METHODS differential_set_total FOR TESTING RAISING cx_static_check.

    METHODS next_random
      IMPORTING iv_max      TYPE ty_amount
      RETURNING VALUE(rv_n) TYPE ty_amount.
    METHODS split_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_04 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_05 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_06 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_07 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_08 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_09 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_10 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_11 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS split_cases_12 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_04 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_05 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS set_total_cases_06 RETURNING VALUE(rt_cases) TYPE string_table.
ENDCLASS.


CLASS ltc_allocator IMPLEMENTATION.

  METHOD split_three_equal_by_key.
    " 100 over three equal weights: the leftover unit goes to the smallest key, wherever it sits.
    DATA(lt_shares) = zcl_pln_allocator=>split(
      it_weights = VALUE #( ( key = `C` amount = 1 ) ( key = `A` amount = 1 ) ( key = `B` amount = 1 ) )
      iv_total   = 100 ).
    cl_abap_unit_assert=>assert_equals( act = lt_shares[ key = `A` ]-amount exp = 34 ).
    cl_abap_unit_assert=>assert_equals( act = lt_shares[ key = `B` ]-amount exp = 33 ).
    cl_abap_unit_assert=>assert_equals( act = lt_shares[ key = `C` ]-amount exp = 33 ).
    cl_abap_unit_assert=>assert_equals( act = lt_shares[ 1 ]-key exp = `C` msg = `input order kept` ).
  ENDMETHOD.

  METHOD split_reversal_cancels.
    DATA(lt_weights) = VALUE zcl_pln_allocator=>tt_share( ( key = `A` amount = 1 ) ( key = `B` amount = 1 ) ).
    DATA(lt_plus) = zcl_pln_allocator=>split( it_weights = lt_weights iv_total = 1 ).
    DATA(lt_minus) = zcl_pln_allocator=>split( it_weights = lt_weights iv_total = -1 ).
    LOOP AT lt_plus INTO DATA(ls_plus).
      cl_abap_unit_assert=>assert_equals( act = lt_minus[ key = ls_plus-key ]-amount
                                          exp = CONV ty_amount( 0 - ls_plus-amount ) ).
    ENDLOOP.
  ENDMETHOD.

  METHOD split_rejects_negative_weight.
    TRY.
        zcl_pln_allocator=>split( it_weights = VALUE #( ( key = `A` amount = -1 ) ( key = `B` amount = 2 ) )
                                  iv_total   = 10 ).
        cl_abap_unit_assert=>fail( `negative weight accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-negative_weight ).
    ENDTRY.
  ENDMETHOD.

  METHOD split_no_driver.
    TRY.
        zcl_pln_allocator=>split( it_weights = VALUE #( ( key = `A` amount = 0 ) ) iv_total = 10 ).
        cl_abap_unit_assert=>fail( `zero driver accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-no_driver ).
    ENDTRY.
  ENDMETHOD.

  METHOD set_total_keeps_locked.
    DATA(lt_out) = zcl_pln_allocator=>set_total(
      it_leaves = VALUE #( ( key = `A` value = 500 locked = abap_true )
                           ( key = `B` value = 300 )
                           ( key = `C` value = 200 ) )
      iv_target = 1500 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `A` ]-value exp = 500 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `B` ]-value exp = 600 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `C` ]-value exp = 400 ).
  ENDMETHOD.

  METHOD set_total_below_locked.
    TRY.
        zcl_pln_allocator=>set_total( it_leaves = VALUE #( ( key = `A` value = 500 locked = abap_true )
                                                           ( key = `B` value = 300 ) )
                                      iv_target = 400 ).
        cl_abap_unit_assert=>fail( `target below locked total accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-below_locked_total ).
    ENDTRY.
  ENDMETHOD.

  METHOD set_total_all_locked.
    TRY.
        zcl_pln_allocator=>set_total( it_leaves = VALUE #( ( key = `A` value = 500 locked = abap_true ) )
                                      iv_target = 600 ).
        cl_abap_unit_assert=>fail( `all-locked change accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-all_locked ).
    ENDTRY.
  ENDMETHOD.

  METHOD set_total_noop_without_driver.
    DATA(lt_in) = VALUE zcl_pln_allocator=>tt_leaf( ( key = `A` value = 0 ) ( key = `B` value = 0 ) ).
    DATA(lt_out) = zcl_pln_allocator=>set_total( it_leaves = lt_in iv_target = 0 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out exp = lt_in ).
  ENDMETHOD.

  METHOD spread_with_locked_month.
    DATA lt_periods TYPE zcl_pln_allocator=>tt_period.
    DO 12 TIMES.
      APPEND VALUE #( key = |P{ sy-index WIDTH = 2 ALIGN = RIGHT PAD = '0' }| weight = 1 ) TO lt_periods.
    ENDDO.
    lt_periods[ 3 ]-locked = abap_true.
    lt_periods[ 3 ]-value = 50000.
    DATA(lt_out) = zcl_pln_allocator=>spread( it_periods = lt_periods iv_annual = 120001 ).
    DATA(lv_sum) = REDUCE ty_amount( INIT s = CONV ty_amount( 0 ) FOR p IN lt_out NEXT s = s + p-value ).
    cl_abap_unit_assert=>assert_equals( act = lv_sum exp = 120001 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ 3 ]-value exp = 50000 ).
    " 70001 over 11 open months: 6363 each, 8 leftover units to P01, P02, P04 ... P09 (key order)
    cl_abap_unit_assert=>assert_equals( act = lt_out[ 1 ]-value exp = 6364 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ 9 ]-value exp = 6364 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ 10 ]-value exp = 6363 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ 12 ]-value exp = 6363 ).
  ENDMETHOD.

  METHOD node_total_locked_subtree.
    DATA(lt_nodes) = VALUE zcl_pln_allocator=>tt_node(
      ( key = `ROOT` )
      ( key = `D1` parent = `ROOT` locked = abap_true )
      ( key = `D2` parent = `ROOT` )
      ( key = `CC11` parent = `D1` value = 400 )
      ( key = `CC21` parent = `D2` value = 300 )
      ( key = `CC22` parent = `D2` value = 300 ) ).
    DATA(lt_out) = zcl_pln_allocator=>set_node_total( it_nodes = lt_nodes iv_node = `ROOT` iv_target = 1600 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `CC11` ]-value exp = 400 msg = `locked subtree` ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `CC21` ]-value exp = 600 ).
    cl_abap_unit_assert=>assert_equals( act = lt_out[ key = `CC22` ]-value exp = 600 ).
    TRY.
        zcl_pln_allocator=>set_node_total( it_nodes = lt_nodes iv_node = `CC11` iv_target = 999 ).
        cl_abap_unit_assert=>fail( `leaf under locked node changed` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-all_locked ).
    ENDTRY.
  ENDMETHOD.

  METHOD node_total_detects_cycle.
    TRY.
        zcl_pln_allocator=>set_node_total(
          it_nodes  = VALUE #( ( key = `A` parent = `B` ) ( key = `B` parent = `A` ) ( key = `X` parent = `A` value = 1 ) )
          iv_node   = `A`
          iv_target = 5 ).
        cl_abap_unit_assert=>fail( `cycle not detected` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-hierarchy_cycle ).
    ENDTRY.
  ENDMETHOD.

  METHOD next_random.
    mv_seed = ( mv_seed * 1103515245 + 12345 ) MOD 2147483648.
    rv_n = mv_seed MOD ( iv_max + 1 ).
  ENDMETHOD.

  METHOD property_random_splits.
    " Conservation, one-unit bound, order independence and reversal, on pseudo-random inputs.
    mv_seed = 20261020.
    DO 300 TIMES.
      DATA(lv_n) = CONV ty_amount( next_random( 9 ) + 1 ).
      DATA lt_w TYPE zcl_pln_allocator=>tt_share.
      CLEAR lt_w.
      DO lv_n TIMES.
        APPEND VALUE #( key    = |K{ next_random( 999999 ) WIDTH = 6 ALIGN = RIGHT PAD = '0' }{ sy-index }|
                        amount = COND #( WHEN next_random( 4 ) = 0 THEN 0 ELSE next_random( 1000 ) ) ) TO lt_w.
      ENDDO.
      lt_w[ 1 ]-amount = lt_w[ 1 ]-amount + 1.
      DATA(lv_total) = CONV ty_amount( next_random( 2000000000 ) - 1000000000 ).
      DATA(lt_s) = zcl_pln_allocator=>split( it_weights = lt_w iv_total = lv_total ).
      DATA(lv_wsum) = REDUCE ty_amount( INIT s = CONV ty_amount( 0 ) FOR w IN lt_w NEXT s = s + w-amount ).
      DATA(lv_sum) = REDUCE ty_amount( INIT s = CONV ty_amount( 0 ) FOR x IN lt_s NEXT s = s + x-amount ).
      cl_abap_unit_assert=>assert_equals( act = lv_sum exp = lv_total msg = `conservation` ).
      LOOP AT lt_w INTO DATA(ls_w).
        DATA(lv_exact) = CONV decfloat34( lv_total ) * ls_w-amount / lv_wsum.
        cl_abap_unit_assert=>assert_true( act = xsdbool( abs( lt_s[ key = ls_w-key ]-amount - lv_exact ) < 1 )
                                          msg = `within one unit` ).
      ENDLOOP.
      DATA(lt_rev_in) = VALUE zcl_pln_allocator=>tt_share( FOR i = lines( lt_w ) THEN i - 1 UNTIL i = 0 ( lt_w[ i ] ) ).
      DATA(lt_rev) = zcl_pln_allocator=>split( it_weights = lt_rev_in iv_total = lv_total ).
      DATA(lt_neg) = zcl_pln_allocator=>split( it_weights = lt_w iv_total = 0 - lv_total ).
      LOOP AT lt_s INTO DATA(ls_s).
        cl_abap_unit_assert=>assert_equals( act = lt_rev[ key = ls_s-key ]-amount exp = ls_s-amount msg = `order` ).
        cl_abap_unit_assert=>assert_equals( act = lt_neg[ key = ls_s-key ]-amount
                                            exp = CONV ty_amount( 0 - ls_s-amount ) msg = `reversal` ).
      ENDLOOP.
    ENDDO.
  ENDMETHOD.

  METHOD differential_split.
    DATA lt_cases TYPE string_table.
    DATA lt_parts TYPE string_table.
    DATA lt_exp TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF split_cases_01( ) TO lt_cases.
    APPEND LINES OF split_cases_02( ) TO lt_cases.
    APPEND LINES OF split_cases_03( ) TO lt_cases.
    APPEND LINES OF split_cases_04( ) TO lt_cases.
    APPEND LINES OF split_cases_05( ) TO lt_cases.
    APPEND LINES OF split_cases_06( ) TO lt_cases.
    APPEND LINES OF split_cases_07( ) TO lt_cases.
    APPEND LINES OF split_cases_08( ) TO lt_cases.
    APPEND LINES OF split_cases_09( ) TO lt_cases.
    APPEND LINES OF split_cases_10( ) TO lt_cases.
    APPEND LINES OF split_cases_11( ) TO lt_cases.
    APPEND LINES OF split_cases_12( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_total) DATA(lv_weights) DATA(lv_expected).
      SPLIT lv_weights AT `,` INTO TABLE lt_parts.
      SPLIT lv_expected AT `,` INTO TABLE lt_exp.
      DATA(lt_w) = VALUE zcl_pln_allocator=>tt_share( ).
      LOOP AT lt_parts INTO DATA(lv_part).
        SPLIT lv_part AT `:` INTO DATA(lv_key) DATA(lv_weight).
        APPEND VALUE #( key = lv_key amount = CONV ty_amount( lv_weight ) ) TO lt_w.
      ENDLOOP.
      DATA(lt_s) = zcl_pln_allocator=>split( it_weights = lt_w iv_total = CONV ty_amount( lv_total ) ).
      LOOP AT lt_s INTO DATA(ls_s).
        IF ls_s-amount <> CONV ty_amount( lt_exp[ sy-tabix ] ).
          lv_failed = lv_failed + 1.
          IF lv_first IS INITIAL.
            lv_first = lv_case.
          ENDIF.
          EXIT.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
    cl_abap_unit_assert=>assert_true( xsdbool( lines( lt_cases ) > 1000 ) ).
  ENDMETHOD.

  METHOD differential_set_total.
    DATA lt_cases TYPE string_table.
    DATA lt_parts TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    DATA lv_got TYPE string.
    APPEND LINES OF set_total_cases_01( ) TO lt_cases.
    APPEND LINES OF set_total_cases_02( ) TO lt_cases.
    APPEND LINES OF set_total_cases_03( ) TO lt_cases.
    APPEND LINES OF set_total_cases_04( ) TO lt_cases.
    APPEND LINES OF set_total_cases_05( ) TO lt_cases.
    APPEND LINES OF set_total_cases_06( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_target) DATA(lv_leaves) DATA(lv_expected).
      SPLIT lv_leaves AT `,` INTO TABLE lt_parts.
      DATA(lt_l) = VALUE zcl_pln_allocator=>tt_leaf( ).
      LOOP AT lt_parts INTO DATA(lv_part).
        SPLIT lv_part AT `:` INTO DATA(lv_key) DATA(lv_value) DATA(lv_lock).
        APPEND VALUE #( key = lv_key value = CONV ty_amount( lv_value ) locked = xsdbool( lv_lock = `X` ) ) TO lt_l.
      ENDLOOP.
      TRY.
          DATA(lt_out) = zcl_pln_allocator=>set_total( it_leaves = lt_l iv_target = CONV ty_amount( lv_target ) ).
          lv_got = `OK:`.
          LOOP AT lt_out INTO DATA(ls_out).
            lv_got = lv_got && COND string( WHEN sy-tabix > 1 THEN `,` ) && |{ ls_out-value }|.
          ENDLOOP.
        CATCH zcx_pln_error INTO DATA(lx).
          lv_got = |ERR:{ lx->reason }|.
      ENDTRY.
      IF lv_got <> lv_expected.
        lv_failed = lv_failed + 1.
        IF lv_first IS INITIAL.
          lv_first = |{ lv_case } got { lv_got }|.
        ENDIF.
      ENDIF.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
    cl_abap_unit_assert=>assert_true( xsdbool( lines( lt_cases ) > 500 ) ).
  ENDMETHOD.

  METHOD split_cases_01.
    APPEND `-458552823584|K094680:10,K583610:5,K233231:3,K660426:7,K703270:0,K553230:10,K224048:12,K161193:7,K052928:1,K04`
        && `0889:2,K165896:0,K119402:5,K778593:8|-65507546226,-32753773113,-19652263868,-45855282358,0,-65507546226,-78609`
        && `055472,-45855282359,-6550754623,-13101509245,0,-32753773113,-52406036981` TO rt_cases.
    APPEND `-545645700055|K962602:1,K748581:1,K763106:1,K095025:1,K334667:1,K836340:1,K921193:1,K831513:1,K214246:1,K09761`
        && `1:1,K748837:1,K608813:1|-45470475004,-45470475005,-45470475004,-45470475005,-45470475005,-45470475004,-4547047`
        && `5004,-45470475004,-45470475005,-45470475005,-45470475005,-45470475005` TO rt_cases.
    APPEND `-17|K488142:1,K336316:1,K178235:1,K326750:1,K596510:1,K633932:1,K993470:1,K145284:1,K097311:1,K967986:1|-2,-2,`
        && `-2,-2,-2,-1,-1,-2,-2,-1` TO rt_cases.
    APPEND `2|K006906:3|2` TO rt_cases.
    APPEND `-14|K546365:667599,K205869:643721,K066956:0,K757773:0,K814503:786321,K671099:295177,K718189:374076,K573161:482`
        && `035,K576239:250149|-3,-3,0,0,-3,-1,-1,-2,-1` TO rt_cases.
    APPEND `27|K066887:12,K203189:0,K663233:6,K918118:5,K061677:0,K201480:12,K228424:8,K823396:4,K857847:6,K332340:8,K3747`
        && `01:9|5,0,2,2,0,5,3,2,2,3,3` TO rt_cases.
    APPEND `1|K833996:1,K216710:1,K351070:1,K127066:1,K414751:1,K270219:1,K899402:1,K076793:1,K846084:1,K416259:1,K886083:`
        && `1,K768647:1,K421535:1,K022177:1|0,0,0,0,0,0,0,0,0,0,0,0,0,1` TO rt_cases.
    APPEND `11|K837677:2,K601022:0,K545008:1,K126348:5,K791426:2,K388421:4,K319388:11,K597964:0,K769870:5,K785931:12,K2571`
        && `33:9,K065835:9,K087241:4|0,0,0,1,0,1,2,0,1,2,1,2,1` TO rt_cases.
    APPEND `0|K961970:1,K693892:1,K080502:1,K411312:1,K567999:1,K417878:1|0,0,0,0,0,0` TO rt_cases.
    APPEND `-383653257071|K858751:1,K878523:1,K189613:1,K689444:1|-95913314268,-95913314267,-95913314268,-95913314268` TO rt_cases.
    APPEND `0|K915498:369809,K576857:777437,K655013:265445|0,0,0` TO rt_cases.
    APPEND `-66143249047|K128716:1,K853430:1,K550396:1|-22047749683,-22047749682,-22047749682` TO rt_cases.
    APPEND `14|K493660:10,K513566:7,K539201:4,K865953:12,K808702:7,K435173:5,K903299:8,K370005:1|3,2,1,3,2,1,2,0` TO rt_cases.
    APPEND `6|K941447:1,K593814:1|3,3` TO rt_cases.
    APPEND `15|K412783:4,K656216:1,K525325:9,K758502:0,K078187:5,K455018:8,K657400:1,K925941:8,K064578:5,K222294:4|1,0,3,0`
        && `,2,3,0,3,2,1` TO rt_cases.
    APPEND `-29|K902206:12,K943415:3,K044683:3,K352774:7,K057374:6,K697506:1,K257100:5,K233687:2,K325642:0,K894545:0,K0911`
        && `14:11,K062943:11,K625455:12|-5,-1,-1,-3,-2,-1,-2,-1,0,0,-4,-4,-5` TO rt_cases.
    APPEND `11|K964071:10,K295855:6,K932214:9,K835571:8,K468038:2,K698022:8|3,2,2,2,0,2` TO rt_cases.
    APPEND `6|K569793:0,K634191:2337|0,6` TO rt_cases.
    APPEND `-908365984138|K349346:3,K005945:6,K266579:1,K928018:11,K337099:1,K682975:10,K380820:9,K550543:5,K759986:2,K558`
        && `531:10,K125423:5|-43255523054,-86511046108,-14418507685,-158603584532,-14418507685,-144185076847,-129766569163`
        && `,-72092538424,-28837015369,-144185076847,-72092538424` TO rt_cases.
    APPEND `-29|K427818:1,K909361:1,K782354:1,K481649:1,K018839:1,K650548:1,K390832:1,K035976:1,K498365:1,K854852:1,K19204`
        && `6:1|-3,-2,-2,-3,-3,-2,-3,-3,-3,-2,-3` TO rt_cases.
    APPEND `4|K502638:1,K834429:1|2,2` TO rt_cases.
    APPEND `-994788648036|K957882:1,K214693:1,K226905:1,K411177:1,K641899:1,K915766:1,K682131:1,K568977:1,K384243:1|-11053`
        && `2072004,-110532072004,-110532072004,-110532072004,-110532072004,-110532072004,-110532072004,-110532072004,-110`
        && `532072004` TO rt_cases.
    APPEND `-42|K834271:0,K944334:0,K542687:821026,K547251:514971,K321807:373556,K049985:586454,K040134:0,K547543:606171,K`
        && `105852:618127,K435670:44349,K416431:866984,K011253:643336,K202810:0,K874280:102176|0,0,-7,-4,-3,-5,0,-5,-5,0,-`
        && `7,-5,0,-1` TO rt_cases.
    APPEND `1|K150551:1,K755380:1,K400517:1,K382214:1,K466102:1,K550102:1,K435189:1,K726562:1,K110849:1,K669064:1,K112062:`
        && `1,K714388:1,K874308:1,K597270:1|0,0,0,0,0,0,0,0,1,0,0,0,0,0` TO rt_cases.
    APPEND `-35|K082382:434462,K262621:627450,K194461:0,K731295:373426,K011910:494922,K682569:994527,K546828:333458,K29915`
        && `8:563698,K594906:0,K331661:846890,K010224:94814,K736449:27390,K501290:0,K104513:262581|-3,-4,0,-3,-3,-7,-2,-4,`
        && `0,-6,-1,0,0,-2` TO rt_cases.
    APPEND `9|K127896:17360,K797142:612398,K080566:584184,K841956:401190,K155628:462794,K629902:558477,K860180:954525|0,2,`
        && `2,1,1,1,2` TO rt_cases.
    APPEND `-19|K170274:1,K148392:1,K078243:1,K410548:1,K973843:1,K191704:1,K386767:1,K298944:1|-3,-3,-3,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `16|K781420:805272,K428579:934545,K682304:200566,K193724:465380,K083789:169710,K382903:218907|5,5,1,3,1,1` TO rt_cases.
    APPEND `-397101763713|K970066:10,K740356:2,K251440:8,K935349:0,K974413:7,K868652:5,K146700:1,K668885:1,K792411:8|-9454`
        && `8038979,-18909607796,-75638431183,0,-66183627286,-47274019490,-9454803898,-9454803898,-75638431183` TO rt_cases.
    APPEND `-251188884920|K662325:1,K386690:1,K274832:1,K577738:1,K113543:1,K901291:1,K905548:1,K652512:1,K697722:1,K25782`
        && `8:1,K451404:1,K319810:1,K149472:1|-19322221917,-19322221917,-19322221917,-19322221917,-19322221917,-1932222191`
        && `7,-19322221916,-19322221917,-19322221917,-19322221917,-19322221917,-19322221917,-19322221917` TO rt_cases.
    APPEND `568625777339|K755383:0,K996295:6,K720071:12,K027234:4,K408677:9,K749096:10,K333201:0,K779290:7,K536889:6,K2783`
        && `22:9,K107429:8|0,48052882592,96105765184,32035255061,72079323888,80088137654,0,56061696357,48052882592,7207932`
        && `3888,64070510123` TO rt_cases.
    APPEND `0|K340406:6,K944460:8,K233649:12,K685237:10,K039156:11,K803940:1,K913855:5|0,0,0,0,0,0,0` TO rt_cases.
    APPEND `-2|K381502:1|-2` TO rt_cases.
    APPEND `311066571295|K980196:2,K596400:7,K536757:6,K068194:0,K408295:8,K381626:0,K922427:2,K621701:11|17281476183,6048`
        && `5166641,51844428549,0,69125904732,0,17281476183,95048119007` TO rt_cases.
    APPEND `-6|K784591:164337,K452105:61248,K665031:699000,K323991:232622,K467827:421919|-1,0,-3,-1,-1` TO rt_cases.
    APPEND `16|K460094:0,K297025:942366,K444498:517267,K963482:56629,K029117:702818,K524493:278652,K650533:338260,K665625:`
        && `314496,K767058:0,K998658:0,K083979:904419|0,4,2,0,3,1,1,1,0,0,4` TO rt_cases.
    APPEND `-6|K220869:459972,K895994:413051,K763467:473976,K706201:845884,K406513:512025,K473937:101684,K073066:0,K659777`
        && `:93961|-1,-1,-1,-2,-1,0,0,0` TO rt_cases.
    APPEND `-23|K012087:1,K512581:1,K610908:1,K561833:1,K151101:1,K701484:1,K038909:1,K804860:1,K806472:1,K265736:1|-3,-2,`
        && `-2,-2,-3,-2,-3,-2,-2,-2` TO rt_cases.
    APPEND `3|K305102:1|3` TO rt_cases.
    APPEND `-2|K889173:11,K244867:9,K528257:2,K744690:11,K124510:1,K068650:6|-1,0,0,-1,0,0` TO rt_cases.
    APPEND `-156348674396|K816704:10,K360495:0,K800852:12,K736149:8,K778320:1,K773490:7,K805815:5,K539813:5,K868698:10|-26`
        && `956667999,0,-32348001599,-21565334399,-2695666800,-18869667600,-13478334000,-13478334000,-26956667999` TO rt_cases.
    APPEND `13|K432701:245129,K316435:931835,K752519:236285,K739292:891317,K967366:0,K016978:850357,K085013:42521|1,4,1,4,`
        && `0,3,0` TO rt_cases.
    APPEND `8|K044333:0,K664570:347830,K045093:0|0,8,0` TO rt_cases.
    APPEND `-613235847021|K423640:10|-613235847021` TO rt_cases.
    APPEND `-11|K474815:166612,K846976:927852,K838779:807396,K877336:755320,K078032:177403,K989732:759000,K269608:793723,K`
        && `671679:584133,K276266:249774,K539791:0,K345252:0|0,-2,-2,-2,0,-2,-2,-1,0,0,0` TO rt_cases.
    APPEND `3|K316053:809363|3` TO rt_cases.
    APPEND `-7|K201337:0,K407750:941549,K885178:544448,K712994:0|0,-4,-3,0` TO rt_cases.
    APPEND `-448749816190|K561140:1,K824970:4,K485980:8,K823309:10,K143151:7,K993707:8,K096398:1,K576267:0,K163446:4,K2644`
        && `07:2,K051547:8|-8466977664,-33867910656,-67735821312,-84669776639,-59268843648,-67735821311,-8466977664,0,-338`
        && `67910656,-16933955328,-67735821312` TO rt_cases.
    APPEND `808931777967|K183157:6,K753810:5,K585668:10,K746801:2,K795051:1,K280674:6,K262988:6,K491192:5,K338983:2|112874`
        && `201577,94061834647,188123669295,37624733859,18812366929,112874201577,112874201577,94061834647,37624733859` TO rt_cases.
    APPEND `-5|K466838:987188,K919005:279150,K003954:0,K241363:0|-4,-1,0,0` TO rt_cases.
    APPEND `-5|K783009:64234,K243862:781871|0,-5` TO rt_cases.
    APPEND `-6|K703028:1,K142503:10,K701764:9,K703582:12,K017528:6,K257490:1,K299390:9,K111537:11,K640503:11,K930955:7,K20`
        && `5697:3|0,-1,-1,-1,0,0,-1,-1,-1,0,0` TO rt_cases.
    APPEND `-18|K829055:1,K830049:1,K192468:1,K764458:1,K735659:1,K016362:1,K281270:1|-2,-2,-3,-2,-3,-3,-3` TO rt_cases.
    APPEND `20|K750674:447486,K928569:213168,K892663:407262,K884209:0,K779818:0,K231856:450626,K749443:556354,K655593:4029`
        && `,K402595:778759|3,2,3,0,0,3,4,0,5` TO rt_cases.
    APPEND `19|K810662:1,K921251:1,K773041:1,K701208:1,K891064:1,K100294:1,K329799:1,K718198:1,K223489:1,K347704:1,K375915`
        && `:1,K797979:1|1,1,1,2,1,2,2,2,2,2,2,1` TO rt_cases.
    APPEND `40|K089462:11,K257911:12,K948379:11,K352571:12,K417262:8,K689868:2,K198631:11,K154340:4,K567676:11,K065255:4,K`
        && `387086:3,K178740:8,K492478:1,K491124:10|4,4,4,4,3,1,4,2,4,2,1,3,0,4` TO rt_cases.
    APPEND `851317145505|K529049:1,K342749:1,K249518:1,K449417:1,K123091:1,K905115:1,K628491:1,K451047:1,K016728:1,K121715`
        && `:1,K685503:1,K235299:1,K219348:1,K822438:1|60808367536,60808367536,60808367536,60808367536,60808367536,6080836`
        && `7536,60808367536,60808367536,60808367537,60808367536,60808367536,60808367536,60808367536,60808367536` TO rt_cases.
    APPEND `106949817255|K978788:12,K913407:11,K974151:7|42779926902,39214932994,24954957359` TO rt_cases.
    APPEND `480125545444|K235119:9,K715883:11,K827638:1,K673865:7,K258339:9,K831328:7|98207497932,120031386361,10911944215`
        && `,76383609502,98207497932,76383609502` TO rt_cases.
    APPEND `-319858257847|K763921:2,K464806:0,K226566:0,K542089:12,K058445:10,K380312:10,K600248:9,K502049:3,K895996:10,K6`
        && `43309:9,K537420:1,K236358:11,K547988:6,K997463:4|-7353063399,0,0,-44118380393,-36765316994,-36765316994,-33088`
        && `785295,-11029595098,-36765316994,-33088785294,-3676531699,-40441848693,-22059190196,-14706126798` TO rt_cases.
    APPEND `548730999029|K800267:1,K806115:10,K140289:5,K958303:6,K107453:12,K561225:12,K192530:6,K404908:11,K396209:2|844`
        && `2015370,84420153697,42210076848,50652092218,101304184436,101304184436,50652092218,92862169067,16884030739` TO rt_cases.
    APPEND `24|K125447:0,K976955:928757,K323226:0,K254024:0,K773547:993524,K294516:588181,K113012:770829,K492740:0,K793300`
        && `:0,K136679:64013|0,7,0,0,7,4,6,0,0,0` TO rt_cases.
    APPEND `-918287887261|K078989:1,K860714:1,K359791:1,K541188:1,K660413:1|-183657577453,-183657577452,-183657577452,-183`
        && `657577452,-183657577452` TO rt_cases.
    APPEND `-356461126357|K743464:1,K837248:1,K891055:1,K152711:1,K383788:1,K981385:1|-59410187726,-59410187726,-594101877`
        && `26,-59410187727,-59410187726,-59410187726` TO rt_cases.
    APPEND `-32|K020256:0,K880835:547270,K314408:0,K679659:858614,K243777:0,K619899:718564,K080667:874323,K854122:69967,K8`
        && `20004:345862,K281845:0,K832018:157125,K109977:7264|0,-5,0,-8,0,-6,-8,-1,-3,0,-1,0` TO rt_cases.
    APPEND `15|K262943:0,K143566:679063,K461930:551917,K765397:138620,K294305:0,K915772:0,K094506:764970,K643985:977504,K0`
        && `06762:732800,K550562:0|0,3,2,0,0,0,3,4,3,0` TO rt_cases.
    APPEND `-12|K494474:7,K390048:1,K360008:4,K112030:7,K332020:4,K676062:11,K997376:10,K760896:2,K356836:4|-2,0,-1,-2,-1,`
        && `-3,-2,0,-1` TO rt_cases.
    APPEND `11|K784775:333779,K145059:0,K120968:197888,K802862:200805,K166469:115827,K147690:989133,K460592:625532,K916005`
        && `:0,K621892:683701,K372501:0,K783344:0|1,0,1,1,0,4,2,0,2,0,0` TO rt_cases.
    APPEND `16|K392725:4,K870447:5,K750779:6,K332953:1,K985482:7,K168596:4,K688904:6,K982442:5,K764931:11,K717303:4|1,2,2,`
        && `0,2,1,2,2,3,1` TO rt_cases.
    APPEND `162378520487|K913923:1,K843665:1,K609072:1|54126173495,54126173496,54126173496` TO rt_cases.
    APPEND `837004813861|K466736:0,K148735:6,K002177:12,K939227:3,K946137:11,K823893:11,K203301:7,K192506:1,K840472:2,K386`
        && `996:4|0,88105769880,176211539761,44052884940,161527244780,161527244780,102790064860,14684294980,29368589960,58`
        && `737179920` TO rt_cases.
    APPEND `13|K840158:150164,K650247:0,K073803:0,K094346:359510,K974030:860015|2,0,0,3,8` TO rt_cases.
    APPEND `-5|K316357:1,K312794:1,K223759:1,K952802:1,K961121:1|-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `15|K207828:317344,K751949:887792,K122577:991787,K113055:971512,K407824:10574,K840485:0,K327856:813810,K981238:`
        && `0,K829183:282440|1,3,4,3,0,0,3,0,1` TO rt_cases.
    APPEND `-643257960414|K944292:4,K054138:9,K900489:10|-111870949637,-251709636684,-279677374093` TO rt_cases.
    APPEND `374635690023|K198723:11,K062995:11,K423955:5,K967059:2,K602260:0,K244943:2,K647885:9,K269234:9,K370057:12,K805`
        && `715:5,K054945:6,K928488:10|50256007198,50256007198,22843639636,9137455854,0,9137455854,41118551344,41118551344`
        && `,54824735125,22843639636,27412367563,45687279271` TO rt_cases.
    APPEND `-4|K264675:1,K620345:1,K892447:1,K046225:1,K447328:1,K995008:1,K185251:1,K737405:1,K774327:1,K667333:1|-1,0,0,`
        && `-1,-1,0,-1,0,0,0` TO rt_cases.
    APPEND `1|K581862:1,K817035:1,K705258:1,K223432:1|0,0,0,1` TO rt_cases.
    APPEND `741419371756|K138575:1,K482702:1,K403539:1,K415375:1,K002042:1,K546826:1,K352477:1,K123511:1,K642557:1,K375241`
        && `:1,K746904:1,K610591:1,K210414:1,K295070:1|52958526554,52958526554,52958526554,52958526554,52958526554,5295852`
        && `6554,52958526554,52958526554,52958526554,52958526554,52958526554,52958526554,52958526554,52958526554` TO rt_cases.
    APPEND `-3|K548730:749442,K219112:867551,K728628:0|-1,-2,0` TO rt_cases.
    APPEND `-3|K525919:0,K886737:737733,K356106:575551,K983292:296416,K151655:274251,K473239:0|0,-1,-1,-1,0,0` TO rt_cases.
    APPEND `-7|K980934:25199,K360576:535420,K991301:479367,K313211:472033,K164364:2983,K457273:297721,K013618:484649|0,-2,`
        && `-1,-1,0,-1,-2` TO rt_cases.
    APPEND `-6|K276636:406852,K333152:565509|-3,-3` TO rt_cases.
    APPEND `-4|K065834:1,K779249:1,K555659:1,K919010:1|-1,-1,-1,-1` TO rt_cases.
    APPEND `7|K885170:563800,K843382:332362,K722694:479635,K223306:601628,K499852:393168,K974716:700854,K228253:316325,K80`
        && `3743:927006,K294543:7773,K273986:0,K505759:454535,K197930:915630|1,0,1,1,0,1,0,1,0,0,1,1` TO rt_cases.
    APPEND `4|K851421:0,K265020:0,K440119:576431,K606145:0,K122044:132507,K243413:49606,K669258:0,K179914:144197|0,0,2,0,1`
        && `,0,0,1` TO rt_cases.
    APPEND `-798992391616|K765808:8,K837485:7,K138850:9,K913960:2,K475467:6,K883918:2,K729185:6,K173866:12,K568235:3,K4943`
        && `68:8,K523018:4|-95402076611,-83476817035,-107327336187,-23850519153,-71551557458,-23850519153,-71551557458,-14`
        && `3103114916,-35775778729,-95402076611,-47701038305` TO rt_cases.
    APPEND `27|K565785:11,K158040:0,K802878:8,K453361:10,K990043:2,K594478:2,K374149:12,K190685:8,K533141:12,K988389:8|4,0`
        && `,3,4,1,1,4,3,4,3` TO rt_cases.
    APPEND `62002190106|K608535:12,K231757:7,K993800:1,K997315:1|35429822918,20667396702,2952485243,2952485243` TO rt_cases.
    APPEND `-867449213749|K494988:1,K436927:1,K320575:1,K241375:1|-216862303437,-216862303437,-216862303437,-216862303438` TO rt_cases.
    APPEND `19|K441562:1,K130206:1,K299497:1,K111240:1,K357485:1,K556741:1,K636542:1|3,3,3,3,3,2,2` TO rt_cases.
    APPEND `-1|K864521:0,K329500:0,K521674:301147,K875415:0,K675372:304694,K173365:604784|0,0,0,0,0,-1` TO rt_cases.
    APPEND `-12|K052523:1,K248344:1,K597857:1,K221679:1,K343722:1|-3,-2,-2,-3,-2` TO rt_cases.
    APPEND `2|K529631:1,K071620:1,K724889:1,K933901:1,K432142:1,K575987:1,K533671:1,K922008:1,K407746:1|0,1,0,0,0,0,0,0,1` TO rt_cases.
    APPEND `-1|K985984:1|-1` TO rt_cases.
    APPEND `-600084783553|K291552:1,K968087:1,K555733:1,K480922:1,K242585:1,K654925:1|-100014130592,-100014130592,-1000141`
        && `30592,-100014130592,-100014130593,-100014130592` TO rt_cases.
    APPEND `4|K032519:623311,K607599:391536,K256724:839320|1,1,2` TO rt_cases.
    APPEND `-5|K977334:0,K055191:0,K596630:790802,K755510:579747,K588160:0,K054526:260188,K587900:135325|0,0,-2,-2,0,-1,0` TO rt_cases.
    APPEND `-11|K161665:1,K961007:1,K374266:1,K523082:1,K422573:1,K625755:1,K082850:1,K448677:1,K815798:1|-2,-1,-1,-1,-1,-`
        && `1,-2,-1,-1` TO rt_cases.
    APPEND `20|K859701:1,K402911:1,K889728:1,K974509:1,K876152:1,K660515:1,K937326:1,K696898:1,K771171:1,K095446:1,K102040`
        && `:1,K568608:1|2,2,1,1,1,2,1,2,2,2,2,2` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_02.
    APPEND `-23|K155183:98068,K765993:101164,K081539:769867,K398211:0,K719887:0,K462407:809835,K526967:636840,K548831:0,K7`
        && `34561:823358,K077702:364004,K952447:0,K728303:705855,K997694:534759|0,0,-4,0,0,-4,-3,0,-4,-2,0,-3,-3` TO rt_cases.
    APPEND `-197616665954|K131455:1,K854798:1|-98808332977,-98808332977` TO rt_cases.
    APPEND `1|K999085:8,K478295:5|1,0` TO rt_cases.
    APPEND `-160509867929|K026278:1,K126528:1,K771733:1,K528406:1,K072571:1,K706110:1,K672552:1,K780731:1,K302046:1,K62825`
        && `7:1|-16050986793,-16050986793,-16050986793,-16050986793,-16050986793,-16050986793,-16050986793,-16050986792,-1`
        && `6050986793,-16050986793` TO rt_cases.
    APPEND `-27|K235593:873709,K724219:0,K354458:0,K008423:278896,K874501:688658,K282280:0,K096220:185583,K338594:959983,K`
        && `344758:0|-8,0,0,-2,-6,0,-2,-9,0` TO rt_cases.
    APPEND `12|K853175:844898,K160487:56309,K849381:169957,K226125:98606,K709786:0,K047570:31467,K238058:493776,K494686:91`
        && `5107,K536268:0,K666857:476720|3,0,1,0,0,0,2,4,0,2` TO rt_cases.
    APPEND `-576071937451|K729859:1,K173748:1,K265629:1,K844214:1,K761798:1,K829039:1,K289577:1,K244877:1|-72008992181,-72`
        && `008992182,-72008992182,-72008992181,-72008992181,-72008992181,-72008992181,-72008992182` TO rt_cases.
    APPEND `-39|K764224:0,K873557:909325,K277851:890218,K321420:892069,K097780:797765,K269899:601009,K715192:611976,K76832`
        && `7:874518,K576080:378911,K402769:99334,K835565:429628,K371043:0,K309989:464378,K140665:100010|0,-5,-5,-5,-4,-3,`
        && `-3,-5,-2,-1,-2,0,-3,-1` TO rt_cases.
    APPEND `902618950834|K454787:3,K764939:2,K540627:1,K044345:6,K880305:4,K917937:7,K149120:12,K546233:6,K573486:5,K59094`
        && `3:5,K152924:4,K121003:8,K348417:2,K116503:0|41659336192,27772890795,13886445397,83318672385,55545781590,972051`
        && `17782,166637344769,83318672385,69432226987,69432226987,55545781590,111091563180,27772890795,0` TO rt_cases.
    APPEND `-456745931820|K249569:1,K781604:1|-228372965910,-228372965910` TO rt_cases.
    APPEND `-864529582608|K875672:1,K447496:1,K331241:1,K064591:1,K871668:1,K951896:1,K059151:1,K462536:1,K056833:1,K15272`
        && `5:1,K154106:1,K177541:1,K704256:1,K292408:1|-61752113043,-61752113043,-61752113043,-61752113044,-61752113043,-`
        && `61752113043,-61752113044,-61752113043,-61752113044,-61752113044,-61752113044,-61752113044,-61752113043,-617521`
        && `13043` TO rt_cases.
    APPEND `265316154268|K075447:1,K058466:1,K395917:1,K207899:1|66329038567,66329038567,66329038567,66329038567` TO rt_cases.
    APPEND `-8|K189066:218695,K567464:0,K934900:532642,K846684:0,K854029:945221,K049481:570948,K581588:0,K930693:310308,K1`
        && `21793:453115,K776518:125354,K561768:216114|-1,0,-1,0,-2,-1,0,-1,-1,0,-1` TO rt_cases.
    APPEND `22|K556509:0,K549198:381154,K188642:376068,K111864:210352,K129360:428414,K874266:0,K432571:0,K593545:456197,K0`
        && `18370:762351,K640351:537906,K589417:860334,K997657:790095,K571039:0|0,2,2,1,2,0,0,2,3,2,4,4,0` TO rt_cases.
    APPEND `-22|K015558:908281,K388111:752303,K371800:0,K322656:220220,K765121:631868,K548897:611851,K159903:476671,K36740`
        && `5:95955|-5,-4,0,-1,-4,-4,-3,-1` TO rt_cases.
    APPEND `-3|K254758:1,K788989:1,K867901:1,K319622:1,K446698:1,K179753:1,K656608:1,K851075:1,K274806:1|-1,0,0,0,0,-1,0,0`
        && `,-1` TO rt_cases.
    APPEND `-1|K925668:1|-1` TO rt_cases.
    APPEND `36|K729376:0,K984623:323660,K097057:78549,K103615:401114,K294591:0,K468970:81014,K305085:0,K857298:819963,K890`
        && `610:653948,K679532:845209,K218372:581830,K219609:581055,K421320:0,K837327:537312|0,2,1,3,0,1,0,6,5,6,4,4,0,4` TO rt_cases.
    APPEND `19|K820490:567986,K791027:164828,K053586:757502,K646415:480606,K448012:841465,K553677:641675,K890307:994172,K5`
        && `81682:0,K602929:365005|2,1,3,2,3,3,4,0,1` TO rt_cases.
    APPEND `175117289585|K136054:1,K611232:1,K363991:1,K817455:1,K381399:1,K144902:1,K241733:1,K365531:1,K322818:1|1945747`
        && `6621,19457476620,19457476621,19457476620,19457476620,19457476621,19457476621,19457476620,19457476621` TO rt_cases.
    APPEND `-85305221899|K059681:1,K549274:1,K591363:1|-28435073967,-28435073966,-28435073966` TO rt_cases.
    APPEND `-5|K095862:1,K988878:1,K819261:1,K149532:1,K381549:1,K339726:1,K832497:1|-1,0,-1,-1,-1,-1,0` TO rt_cases.
    APPEND `758121169174|K715882:1|758121169174` TO rt_cases.
    APPEND `3|K831652:1|3` TO rt_cases.
    APPEND `-4|K441292:0,K002328:8,K613510:4,K182454:6,K527087:4,K432871:4,K261978:6,K827109:11,K109795:0,K166260:0,K09121`
        && `4:12,K861215:11|0,-1,0,0,0,0,0,-1,0,0,-1,-1` TO rt_cases.
    APPEND `-18|K680447:1,K698968:1,K781950:1,K526734:1,K924758:1,K249789:1,K865743:1,K150349:1,K223938:1,K644112:1,K35500`
        && `5:1|-2,-1,-1,-2,-1,-2,-1,-2,-2,-2,-2` TO rt_cases.
    APPEND `-379892234085|K083791:3,K527290:4|-162810957465,-217081276620` TO rt_cases.
    APPEND `21|K419512:237513,K516074:0,K919914:0,K290453:0,K155500:0,K107030:791482,K576555:85052|4,0,0,0,0,15,2` TO rt_cases.
    APPEND `6|K852683:0,K279200:37655,K614000:219331,K693594:148992,K730470:975117,K331686:743280|0,0,1,0,3,2` TO rt_cases.
    APPEND `-7|K521780:2,K856094:8,K265708:9,K627467:4,K770684:12|0,-2,-2,-1,-2` TO rt_cases.
    APPEND `-6|K500775:523079,K494321:479126,K061169:478326,K587037:905543,K200911:752881,K108961:0,K664085:0,K831512:4222`
        && `27,K402415:86187,K276054:0,K558214:0,K688535:313819,K352531:517166|-1,-1,-1,-1,-1,0,0,0,0,0,0,0,-1` TO rt_cases.
    APPEND `-13|K970698:0,K242939:711681,K914311:0,K724547:0,K466744:433308,K004119:940142|0,-4,0,0,-3,-6` TO rt_cases.
    APPEND `-188037696435|K583075:1,K568831:1,K800465:1|-62679232145,-62679232145,-62679232145` TO rt_cases.
    APPEND `-457518889662|K865004:1,K621013:1,K595615:1,K813215:1,K223857:1,K361186:1,K641094:1,K614396:1,K870503:1|-50835`
        && `432184,-50835432185,-50835432185,-50835432184,-50835432185,-50835432185,-50835432185,-50835432185,-50835432184` TO rt_cases.
    APPEND `-14|K447509:1,K451508:1,K620293:1,K517586:1,K601798:1,K911276:1,K505378:1|-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `-21|K098871:878711,K937651:0,K388425:507887,K589003:269990,K009396:876229,K425346:720098,K247761:0|-6,0,-3,-2,`
        && `-6,-4,0` TO rt_cases.
    APPEND `-5|K512789:6,K123144:6,K347192:4,K429605:6,K838288:6,K435564:2,K018245:5|-1,-1,0,-1,-1,0,-1` TO rt_cases.
    APPEND `7|K063988:612956,K599843:897729,K859573:602322,K267950:875105,K724687:591196,K251844:870811,K317238:980995,K17`
        && `7093:591285,K144027:156468,K885769:551097,K610554:0,K187243:135247,K372066:633166|1,1,1,1,0,1,1,0,0,0,0,0,1` TO rt_cases.
    APPEND `-33|K596339:1,K769904:1,K919336:1,K172070:1,K452818:1,K470154:1,K545118:1,K264978:1,K873822:1,K871548:1,K64726`
        && `8:1|-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3` TO rt_cases.
    APPEND `-423744374824|K841675:1,K901597:1,K091780:1,K479433:1,K057171:1,K814166:1,K944214:1,K453416:1,K821239:1,K14387`
        && `0:1,K273243:1,K941248:1,K375903:1|-32595721140,-32595721140,-32595721141,-32595721140,-32595721141,-3259572114`
        && `0,-32595721140,-32595721140,-32595721140,-32595721141,-32595721141,-32595721140,-32595721140` TO rt_cases.
    APPEND `-13|K064542:1,K092485:1,K075877:1,K143756:1,K816847:1,K740865:1,K837754:1,K805947:1,K839635:1,K018179:1,K46595`
        && `4:1,K138199:1,K104122:1|-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `-63708091566|K075971:1,K780884:1,K289496:1|-21236030522,-21236030522,-21236030522` TO rt_cases.
    APPEND `-163214680874|K452495:11,K097034:4,K487119:3,K640028:0,K879341:3|-85493404267,-31088510643,-23316382982,0,-233`
        && `16382982` TO rt_cases.
    APPEND `237267418127|K953927:1,K761023:1,K013798:1,K937694:1,K924752:1,K462197:1,K113956:1,K372958:1,K360107:1|2636304`
        && `6458,26363046458,26363046459,26363046458,26363046458,26363046459,26363046459,26363046459,26363046459` TO rt_cases.
    APPEND `-2|K758326:1,K856750:1,K257434:1,K986747:1,K112097:1,K504790:1|0,0,-1,0,-1,0` TO rt_cases.
    APPEND `-5|K155903:476297,K025687:0,K249848:0,K761251:343909,K299127:0,K967705:440088|-2,0,0,-1,0,-2` TO rt_cases.
    APPEND `18|K378331:532028,K051253:699907,K465888:453471,K392007:181153,K976649:904832,K977335:0,K138024:401848,K559264`
        && `:160090,K873945:760660,K802816:568,K426888:600964,K859475:0,K170633:288392,K794390:134568|2,2,2,1,3,0,1,1,3,0,`
        && `2,0,1,0` TO rt_cases.
    APPEND `-263431058584|K137147:1,K207898:1,K922816:1,K666644:1,K658551:1,K354929:1,K969796:1,K343268:1,K306084:1,K77817`
        && `2:1,K433400:1,K387250:1,K994443:1,K345331:1|-18816504185,-18816504185,-18816504184,-18816504184,-18816504184,-`
        && `18816504185,-18816504184,-18816504185,-18816504185,-18816504184,-18816504185,-18816504185,-18816504184,-188165`
        && `04185` TO rt_cases.
    APPEND `42983659383|K395796:6,K756272:6,K890472:11,K472949:3,K280770:6,K028775:2,K015292:6,K497698:5,K614347:7,K816102`
        && `:5,K774671:7|4029718067,4029718067,7387816457,2014859034,4029718067,1343239356,4029718067,3358098389,470133774`
        && `5,3358098389,4701337745` TO rt_cases.
    APPEND `12|K265929:1,K446919:1,K525486:1,K918662:1,K157679:1,K553870:1|2,2,2,2,2,2` TO rt_cases.
    APPEND `562006839266|K146266:5,K560820:4,K158214:11,K303208:0,K666880:4,K157804:0|117084758181,93667806544,25758646799`
        && `7,0,93667806544,0` TO rt_cases.
    APPEND `31|K215460:0,K334404:153484,K558046:139228,K446809:148211,K194318:0,K924412:0,K178263:0,K625340:733989,K765339`
        && `:537301,K597638:860562,K508421:105496|0,2,2,2,0,0,0,8,6,10,1` TO rt_cases.
    APPEND `442359482515|K322125:1,K966476:1,K747533:1,K254930:1,K835447:1,K807908:1,K112407:1|63194211788,63194211787,631`
        && `94211788,63194211788,63194211788,63194211788,63194211788` TO rt_cases.
    APPEND `896118694330|K362860:1,K098138:1,K360946:1,K651393:1,K660819:1,K129688:1,K604446:1,K349532:1|112014836791,1120`
        && `14836792,112014836791,112014836791,112014836791,112014836792,112014836791,112014836791` TO rt_cases.
    APPEND `-13|K854469:1,K058669:1,K576648:1,K061175:1,K998949:1,K095074:1|-2,-3,-2,-2,-2,-2` TO rt_cases.
    APPEND `27|K340519:306376,K739672:667282,K565751:426374,K337253:121775,K166552:833709,K234817:463400,K264496:0,K211235`
        && `:0,K667815:397283,K176225:30028,K978935:427063,K862984:995137|2,4,2,1,5,3,0,0,2,0,2,6` TO rt_cases.
    APPEND `-10|K684019:0,K156222:672897,K706789:940569,K769372:0,K888576:734127,K448721:763484,K595569:929581,K463602:559`
        && `495|0,-1,-2,0,-2,-2,-2,-1` TO rt_cases.
    APPEND `682330898218|K553475:1|682330898218` TO rt_cases.
    APPEND `12|K954717:1,K140597:1,K951072:1,K759661:1,K412888:1,K609354:1,K857681:1,K403410:1,K700596:1,K888640:1,K373021`
        && `:1,K692139:1,K555738:1|0,1,1,1,1,1,1,1,1,1,1,1,1` TO rt_cases.
    APPEND `128932346442|K929408:1,K791769:1,K545585:1,K208423:1,K660989:1,K082654:1,K641477:1,K971112:1,K055129:1|1432581`
        && `6271,14325816271,14325816271,14325816272,14325816271,14325816272,14325816271,14325816271,14325816272` TO rt_cases.
    APPEND `-826325325381|K021538:10,K599171:4,K563996:0,K736433:2,K961830:0,K459357:6,K504170:1,K768241:5,K745187:10,K848`
        && `780:8,K085048:4,K430750:4,K833636:10,K200769:11|-110176710051,-44070684020,0,-22035342010,0,-66106026031,-1101`
        && `7671005,-55088355025,-110176710051,-88141368041,-44070684020,-44070684020,-110176710051,-121194381056` TO rt_cases.
    APPEND `635727161802|K311693:1,K201162:1,K333637:1|211909053934,211909053934,211909053934` TO rt_cases.
    APPEND `19|K168101:704969,K807786:951735,K068448:34758,K198881:818237,K781169:643748,K295577:0,K821797:287293,K133238:`
        && `0,K763929:8290,K698540:626379,K763068:0,K488426:983026,K998537:69598|3,4,0,3,2,0,1,0,0,2,0,4,0` TO rt_cases.
    APPEND `844292641886|K886665:1,K503190:1|422146320943,422146320943` TO rt_cases.
    APPEND `-21|K128657:7,K905134:5,K055846:11,K643617:7,K659574:8,K787604:1,K177549:9,K904859:4,K013384:4,K922555:5,K3176`
        && `57:6,K431739:3,K498355:10,K835562:10|-2,-1,-3,-2,-2,0,-2,-1,-1,-1,-1,-1,-2,-2` TO rt_cases.
    APPEND `-30|K261928:1,K991507:1,K733522:1,K730370:1,K362593:1,K712037:1,K343909:1,K169415:1,K824009:1,K917069:1,K47806`
        && `0:1,K757681:1,K318929:1|-3,-2,-2,-2,-2,-2,-3,-3,-2,-2,-2,-2,-3` TO rt_cases.
    APPEND `-37229555908|K991937:1,K765841:1,K868478:1,K805027:1,K369980:1,K715237:1,K246755:1,K074480:1|-4653694488,-4653`
        && `694488,-4653694488,-4653694488,-4653694489,-4653694489,-4653694489,-4653694489` TO rt_cases.
    APPEND `1|K746658:3|1` TO rt_cases.
    APPEND `4|K468183:540432,K427602:956897,K901629:236968|1,2,1` TO rt_cases.
    APPEND `21|K685865:0,K867616:201763,K623082:1712,K365984:655927,K060709:238691,K800599:73062,K549301:55789,K270617:265`
        && `114,K291456:611170|0,2,0,6,2,1,1,3,6` TO rt_cases.
    APPEND `496498090155|K908918:1,K901926:1,K381408:1,K985510:1,K321102:1,K046199:1,K930833:1,K201627:1,K275395:1,K251335`
        && `:1,K390569:1,K667353:1,K505746:1,K575101:1|35464149296,35464149297,35464149297,35464149296,35464149297,3546414`
        && `9297,35464149296,35464149297,35464149297,35464149297,35464149297,35464149297,35464149297,35464149297` TO rt_cases.
    APPEND `-526317002270|K775911:1,K692728:1,K448872:1,K417001:1,K257336:1,K688684:1,K496791:1,K883469:1,K272638:1,K58766`
        && `1:1,K893246:1,K934763:1|-43859750189,-43859750189,-43859750189,-43859750189,-43859750190,-43859750189,-4385975`
        && `0189,-43859750189,-43859750190,-43859750189,-43859750189,-43859750189` TO rt_cases.
    APPEND `-2848742091|K175667:949059,K021583:703587,K385570:0,K478685:116925,K794487:0|-1527841675,-1132668823,0,-188231`
        && `593,0` TO rt_cases.
    APPEND `23|K143455:0,K670877:763143,K076346:0,K525448:992860,K787367:760477,K205408:568220,K654863:967625,K025150:7375`
        && `18,K007902:412229|0,3,0,5,3,3,4,3,2` TO rt_cases.
    APPEND `1|K151663:1,K711322:1,K118593:1,K908185:1,K665067:1,K379567:1|0,0,1,0,0,0` TO rt_cases.
    APPEND `660660804701|K762524:5,K075254:6,K613124:11,K301067:1,K071487:3,K163837:5,K466171:7,K546596:9,K164151:10,K5646`
        && `87:3|55055067058,66066080470,121121147529,11011013412,33033040235,55055067058,77077093882,99099120705,11011013`
        && `4117,33033040235` TO rt_cases.
    APPEND `-31|K035285:1,K313822:1,K589655:1,K308337:1,K549960:1,K080104:1,K922440:1,K636266:1,K316120:1,K046435:1,K55644`
        && `8:1,K494282:1,K881848:1,K378962:1|-3,-2,-2,-2,-2,-3,-2,-2,-2,-3,-2,-2,-2,-2` TO rt_cases.
    APPEND `14|K357260:584096,K045566:0,K105798:869054,K134051:789496,K025213:981636,K699364:932798|2,0,3,3,3,3` TO rt_cases.
    APPEND `-2|K347581:248229|-2` TO rt_cases.
    APPEND `523338590635|K422936:1,K587088:1,K696093:1,K774513:1,K703469:1,K623814:1,K413824:1,K741586:1,K615773:1,K340726`
        && `:1,K713967:1|47576235513,47576235512,47576235512,47576235512,47576235512,47576235512,47576235513,47576235512,4`
        && `7576235512,47576235513,47576235512` TO rt_cases.
    APPEND `-79146694350|K335299:1,K229656:1,K819661:1,K746511:1,K628373:1,K291476:1,K926853:1,K188065:1,K540510:1|-879407`
        && `7150,-8794077150,-8794077150,-8794077150,-8794077150,-8794077150,-8794077150,-8794077150,-8794077150` TO rt_cases.
    APPEND `-19|K535453:684356,K526905:829440,K924602:940015,K302292:262230,K948182:0,K479007:216938,K425021:953556,K44288`
        && `6:486280,K678307:498089,K620572:0,K714561:711454,K866305:187528,K879943:0|-2,-3,-3,-1,0,-1,-3,-1,-2,0,-2,-1,0` TO rt_cases.
    APPEND `4|K028782:1,K678353:1,K078666:1,K999984:1,K306993:1|1,1,1,0,1` TO rt_cases.
    APPEND `3|K111657:1,K680817:1,K085587:1|1,1,1` TO rt_cases.
    APPEND `-37|K363969:404202,K902797:41017,K370898:0,K956365:166754,K450297:86682,K650273:0,K491831:115149,K922520:64242`
        && `9,K468452:114727,K442360:197396,K748910:740294,K359510:690635,K531892:594041,K763615:0|-4,0,0,-2,-1,0,-1,-6,-1`
        && `,-2,-7,-7,-6,0` TO rt_cases.
    APPEND `-14|K520093:3,K561200:5,K585169:10,K895065:9,K669827:12|-1,-2,-4,-3,-4` TO rt_cases.
    APPEND `-710171397774|K716768:1,K038704:1,K454310:1,K968568:1,K818129:1,K432545:1,K773065:1,K655067:1,K441547:1,K15556`
        && `1:1,K841528:1,K871179:1|-59180949814,-59180949815,-59180949815,-59180949814,-59180949814,-59180949815,-5918094`
        && `9814,-59180949815,-59180949815,-59180949815,-59180949814,-59180949814` TO rt_cases.
    APPEND `759608910830|K309208:1,K541869:1,K931142:1,K860505:1,K585379:1,K773023:1,K002759:1,K122606:1,K275497:1,K370701`
        && `:1|75960891083,75960891083,75960891083,75960891083,75960891083,75960891083,75960891083,75960891083,75960891083`
        && `,75960891083` TO rt_cases.
    APPEND `-843536248361|K553399:1,K884317:1,K091273:1,K505813:1,K299221:1,K602931:1,K872733:1,K725111:1,K821762:1,K16413`
        && `2:1,K128157:1|-76685113487,-76685113487,-76685113488,-76685113487,-76685113488,-76685113487,-76685113487,-7668`
        && `5113487,-76685113487,-76685113488,-76685113488` TO rt_cases.
    APPEND `542489737940|K158936:1,K295505:1,K119236:1,K383986:1,K812537:1|108497947588,108497947588,108497947588,10849794`
        && `7588,108497947588` TO rt_cases.
    APPEND `-10|K586656:18266,K090809:628581,K046055:960260,K724807:753924|0,-3,-4,-3` TO rt_cases.
    APPEND `7|K715911:7,K080528:11,K250753:8,K420916:11,K101874:9,K833928:3,K726224:5,K380832:11,K481294:11,K966755:7,K889`
        && `705:7,K011601:9|0,1,1,1,1,0,0,1,1,0,0,1` TO rt_cases.
    APPEND `256734014580|K656521:1,K458484:1,K868939:1,K790382:1,K554259:1,K744475:1,K836931:1,K322332:1,K184461:1,K444485`
        && `:1,K289761:1|23339455871,23339455871,23339455870,23339455871,23339455871,23339455871,23339455871,23339455871,2`
        && `3339455871,23339455871,23339455871` TO rt_cases.
    APPEND `-1|K616730:0,K231618:768005|0,-1` TO rt_cases.
    APPEND `-1|K609938:1|-1` TO rt_cases.
    APPEND `0|K428116:0,K385096:1,K054768:11|0,0,0` TO rt_cases.
    APPEND `-3|K099393:399397,K795248:637720,K737007:287134|-1,-1,-1` TO rt_cases.
    APPEND `-16|K807892:1,K122522:1,K348504:1,K549360:1,K438021:1,K025127:1,K709869:1|-2,-3,-2,-2,-2,-3,-2` TO rt_cases.
    APPEND `-3|K598513:1,K795334:1,K412946:1,K913348:1|-1,-1,-1,0` TO rt_cases.
    APPEND `9|K871750:715003,K340883:655774,K835641:7512,K660503:266278,K952619:389347,K760911:84929,K262894:550232,K92512`
        && `4:934808,K195381:0,K392697:546361,K789753:59938,K339158:0|2,1,0,1,1,0,1,2,0,1,0,0` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_03.
    APPEND `-537002565830|K102953:1,K196017:1,K951729:1,K034704:1,K567630:1,K591932:1,K210971:1,K709372:1,K776786:1,K72332`
        && `4:1,K595939:1,K365604:1,K750981:1,K232042:1|-38357326131,-38357326131,-38357326130,-38357326131,-38357326131,-`
        && `38357326131,-38357326131,-38357326131,-38357326130,-38357326130,-38357326131,-38357326131,-38357326130,-383573`
        && `26131` TO rt_cases.
    APPEND `5|K168084:793277,K059889:0,K156604:127274,K632859:142702,K337395:278973,K048347:350614,K492901:28630|2,0,0,1,1`
        && `,1,0` TO rt_cases.
    APPEND `-790759127780|K300520:1,K731147:1,K617403:1,K885958:1|-197689781945,-197689781945,-197689781945,-197689781945` TO rt_cases.
    APPEND `0|K544564:797253,K697716:909412,K247665:223723,K148771:22140,K502583:702872,K441675:399119|0,0,0,0,0,0` TO rt_cases.
    APPEND `2|K642989:421079,K857066:451137,K089035:985863,K480070:700394,K675376:475230,K712826:301416,K038421:201445,K23`
        && `9275:60793|0,0,1,1,0,0,0,0` TO rt_cases.
    APPEND `-8|K769235:534097,K345098:967342,K734833:593492,K670219:300758,K755738:687369,K228528:905027,K549803:880148,K6`
        && `04047:337230,K885384:754289,K324931:864266,K309527:0|-1,-1,-1,0,-1,-1,-1,0,-1,-1,0` TO rt_cases.
    APPEND `17|K310486:657034,K393985:406165,K560590:683627,K115376:52137,K744654:485725,K348199:223506,K200953:989524,K99`
        && `5139:0|3,2,3,0,3,1,5,0` TO rt_cases.
    APPEND `4|K228099:416922,K752213:331699,K349922:840462,K477522:63278,K239950:663874,K041940:887831,K927712:936864,K008`
        && `607:218806,K090261:0,K400283:982061|0,0,1,0,0,1,1,0,0,1` TO rt_cases.
    APPEND `3|K208155:0,K621331:787975,K644704:940867,K791196:170984,K817358:0,K435179:0,K785903:500598,K621891:0,K729898:`
        && `0,K254519:0,K513396:0,K529454:386907,K590398:742896|0,1,1,0,0,0,0,0,0,0,0,0,1` TO rt_cases.
    APPEND `-16|K934834:1,K331275:1,K770187:1,K686564:1,K211518:1,K429865:1,K026650:1,K263394:1|-2,-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `0|K409408:872998,K522851:822866,K099140:693110|0,0,0` TO rt_cases.
    APPEND `-5|K291200:1,K114769:1,K173719:1,K826084:1,K030661:1,K855118:1,K719553:1,K751325:1,K495141:1,K960957:1,K353163`
        && `:1|-1,-1,-1,0,-1,0,0,0,0,0,-1` TO rt_cases.
    APPEND `-12|K364064:384742,K644516:879780,K764402:826576,K277796:725386|-2,-4,-3,-3` TO rt_cases.
    APPEND `-6|K660029:809631,K472424:106071|-5,-1` TO rt_cases.
    APPEND `-445148450434|K296673:11,K975103:11,K861656:7,K300161:7,K575191:6,K154852:12,K467609:11|-75332814689,-75332814`
        && `689,-47939063893,-47939063893,-41090626194,-82181252387,-75332814689` TO rt_cases.
    APPEND `-750583392792|K413719:1,K871387:1,K836522:1,K455006:1,K307024:1,K769719:1,K140785:1|-107226198970,-10722619897`
        && `0,-107226198970,-107226198970,-107226198971,-107226198970,-107226198971` TO rt_cases.
    APPEND `-29|K355644:63524,K278849:253974,K577010:520225,K403741:331299,K150908:436357,K191268:102181,K205769:916624,K9`
        && `38933:21791,K845911:809749,K981355:171796,K016928:391891|0,-2,-4,-2,-3,-1,-7,0,-6,-1,-3` TO rt_cases.
    APPEND `12|K350177:231096,K285323:0,K186972:153658,K377519:81302,K871284:238879,K573035:338608|2,0,2,1,3,4` TO rt_cases.
    APPEND `7|K091573:1,K847454:1,K065225:1,K063951:1,K038992:1,K547208:1,K075182:1,K547348:1,K745983:1,K208872:1,K213788:`
        && `1,K891784:1,K454005:1|1,0,1,1,1,0,1,0,0,1,1,0,0` TO rt_cases.
    APPEND `-14|K791968:1,K536384:1,K177017:1,K882946:1,K305494:1,K535383:1,K653137:1,K469352:1,K201737:1|-1,-1,-2,-1,-2,-`
        && `2,-1,-2,-2` TO rt_cases.
    APPEND `470024875128|K212178:1,K564839:1,K877679:1,K224572:1,K035086:1|94004975026,94004975025,94004975025,94004975026`
        && `,94004975026` TO rt_cases.
    APPEND `-951476000967|K113034:1,K363453:1,K265029:1,K836337:1,K843895:1,K344652:1,K749287:1,K173421:1|-118934500121,-1`
        && `18934500121,-118934500121,-118934500121,-118934500120,-118934500121,-118934500121,-118934500121` TO rt_cases.
    APPEND `-31|K738888:351725,K715384:44331,K668714:214484,K049114:407281,K001857:253487,K690211:528577,K737445:0,K464849`
        && `:665249,K908676:274642,K869165:62633,K388757:63795,K695893:336261|-3,0,-2,-4,-3,-5,0,-6,-3,-1,-1,-3` TO rt_cases.
    APPEND `313228206580|K242403:8,K755978:11,K544829:8,K166863:1,K559849:9,K365812:6,K336625:2,K458252:7,K294625:5,K70645`
        && `2:12,K607968:2,K760838:3,K020883:0|33862508820,46560949627,33862508819,4232813602,38095322422,25396881615,8465`
        && `627205,29629695217,21164068012,50793763229,8465627205,12698440807,0` TO rt_cases.
    APPEND `1|K093941:955025,K691629:179960,K859853:717685,K508295:806072,K771515:772095|1,0,0,0,0` TO rt_cases.
    APPEND `-9|K056516:6,K361148:12,K353261:6,K431177:0,K288977:11,K903244:10,K863922:12,K810860:2,K069961:9,K341705:12|-1`
        && `,-1,-1,0,-1,-1,-1,0,-1,-2` TO rt_cases.
    APPEND `58484305373|K393485:1,K966769:1,K854966:1,K248336:1|14621076343,14621076343,14621076343,14621076344` TO rt_cases.
    APPEND `18|K160277:0,K566607:404103,K973206:976136,K091753:745649,K351660:824916,K322978:255941,K608121:798893,K902111`
        && `:0,K088819:400970,K954917:4009,K650495:207657|0,2,4,3,3,1,3,0,1,0,1` TO rt_cases.
    APPEND `-720256664943|K466165:1,K892639:1,K292765:1,K860806:1,K498673:1,K446667:1,K789476:1,K388935:1,K611596:1,K98920`
        && `6:1,K229620:1|-65477878631,-65477878631,-65477878632,-65477878631,-65477878631,-65477878631,-65477878631,-6547`
        && `7878631,-65477878631,-65477878631,-65477878632` TO rt_cases.
    APPEND `-760239914215|K009015:1,K018184:1,K881445:1,K285622:1,K322686:1,K204799:1|-126706652370,-126706652369,-1267066`
        && `52369,-126706652369,-126706652369,-126706652369` TO rt_cases.
    APPEND `-414495241365|K358821:1,K800973:1,K080614:1,K376960:1,K902625:1,K580959:1,K958964:1|-59213605910,-59213605909,`
        && `-59213605910,-59213605909,-59213605909,-59213605909,-59213605909` TO rt_cases.
    APPEND `-263272934894|K649763:1,K945653:1,K014879:1,K632564:1,K278734:1,K828529:1,K292399:1,K502218:1,K338920:1,K28514`
        && `6:1,K642861:1|-23933903172,-23933903172,-23933903173,-23933903172,-23933903173,-23933903172,-23933903172,-2393`
        && `3903172,-23933903172,-23933903172,-23933903172` TO rt_cases.
    APPEND `577800980328|K374648:4,K841874:2,K521041:6,K072727:0,K767300:10,K714539:8,K225620:0,K378318:8,K874289:9|491745`
        && `51517,24587275759,73761827276,0,122936378793,98349103034,0,98349103035,110642740914` TO rt_cases.
    APPEND `-8|K882336:1,K510112:1,K656925:1,K133873:1,K434515:1,K205969:1,K287736:1|-1,-1,-1,-2,-1,-1,-1` TO rt_cases.
    APPEND `4312509171|K820135:1,K906396:1,K473557:1,K030250:1,K330561:1,K262457:1,K139271:1,K873622:1|539063646,539063646`
        && `,539063646,539063647,539063646,539063647,539063647,539063646` TO rt_cases.
    APPEND `988147592719|K224615:11,K962901:4,K865050:8,K139372:4,K640479:3,K794839:7|293773608646,106826766780,2136535335`
        && `61,106826766781,80120075085,186946841866` TO rt_cases.
    APPEND `-74167891048|K011301:1,K934668:1|-37083945524,-37083945524` TO rt_cases.
    APPEND `-683557690136|K184731:10,K352324:8,K445082:5,K489203:4,K199901:9,K291045:12,K327579:5,K186537:1|-126584757433,`
        && `-101267805946,-63292378716,-50633902973,-113926281690,-151901708919,-63292378716,-12658475743` TO rt_cases.
    APPEND `0|K052276:731757,K557591:0,K925259:0,K652139:728877,K444742:971850,K825728:511419,K116632:0|0,0,0,0,0,0,0` TO rt_cases.
    APPEND `-16|K791647:0,K773184:474026,K122307:771511,K248883:533899,K600650:376680,K261260:919564|0,-2,-4,-3,-2,-5` TO rt_cases.
    APPEND `9|K895144:1,K038083:1,K042474:1,K996285:1,K778350:1,K777412:1,K031953:1,K117244:1,K076029:1,K603284:1,K538409:`
        && `1|0,1,1,0,1,1,1,1,1,1,1` TO rt_cases.
    APPEND `10|K162877:514942,K676111:0,K767647:434734,K270458:522166|3,0,3,4` TO rt_cases.
    APPEND `-27|K431199:1,K442522:1,K821312:1,K462563:1,K862673:1,K808317:1,K193802:1,K764196:1,K326683:1,K534348:1,K43745`
        && `2:1|-3,-3,-2,-2,-2,-2,-3,-2,-3,-2,-3` TO rt_cases.
    APPEND `3|K625839:0,K365094:363393,K885687:660913,K890063:602903,K073777:946260,K547972:756700,K324784:0,K932161:62159`
        && `8,K853353:839998,K573175:570017,K865235:614293,K121105:0,K501493:0,K011541:909189|0,0,0,0,1,0,0,0,1,0,0,0,0,1` TO rt_cases.
    APPEND `13|K954860:1,K388449:1,K893534:1,K070255:1,K883073:1,K303059:1,K828316:1,K209662:1,K312631:1,K976103:1|1,1,1,2`
        && `,1,2,1,2,1,1` TO rt_cases.
    APPEND `3|K547976:1,K358884:1,K155855:1,K089739:1,K869324:1,K146613:1|0,0,1,1,0,1` TO rt_cases.
    APPEND `16|K680335:152800,K649489:0,K905692:629492,K479951:0,K153538:387219,K691882:712539,K606216:601248|1,0,4,0,2,5,`
        && `4` TO rt_cases.
    APPEND `532044530404|K008756:2,K360219:0,K255492:10,K692288:11,K610443:8,K177754:1,K679951:10,K500956:7|21716103282,0,`
        && `108580516409,119438568050,86864413127,10858051641,108580516409,76006361486` TO rt_cases.
    APPEND `-6|K012932:0,K473441:643748,K205325:235290,K567301:531190,K523441:289296|0,-2,-1,-2,-1` TO rt_cases.
    APPEND `533355349623|K239797:2,K767850:4,K726732:2,K178645:7,K259195:2,K659361:10,K331344:4,K998381:8,K247040:4,K46109`
        && `3:10,K090977:12,K227051:0|16410933835,32821867669,16410933834,57438268421,16410933835,82054669173,32821867669,`
        && `65643735338,32821867669,82054669173,98465603007,0` TO rt_cases.
    APPEND `363472495801|K891990:2,K099571:0,K838189:11,K164615:1,K889540:6|36347249580,0,199909872691,18173624790,1090417`
        && `48740` TO rt_cases.
    APPEND `6|K042998:1,K238839:1|3,3` TO rt_cases.
    APPEND `25687517522|K674482:1,K351111:1,K320772:1,K251072:1,K266309:1,K592087:1,K343608:1,K398840:1,K345456:1,K358657:`
        && `1,K569482:1,K053774:1|2140626460,2140626460,2140626460,2140626461,2140626460,2140626460,2140626460,2140626460,`
        && `2140626460,2140626460,2140626460,2140626461` TO rt_cases.
    APPEND `4|K328135:0,K120217:897512|0,4` TO rt_cases.
    APPEND `-24|K355875:1,K187982:1,K765943:1,K165922:1,K590962:1,K562444:1,K942929:1,K361084:1,K401801:1|-3,-3,-2,-3,-2,-`
        && `3,-2,-3,-3` TO rt_cases.
    APPEND `42|K801332:1,K623823:1,K063656:1,K027403:1,K220380:1,K108253:1,K416714:1,K617311:1,K892538:1,K824717:1,K930141`
        && `:1,K767334:1,K254509:1,K347528:1|3,3,3,3,3,3,3,3,3,3,3,3,3,3` TO rt_cases.
    APPEND `918701300660|K655761:1|918701300660` TO rt_cases.
    APPEND `0|K167455:0,K641929:789241,K962183:766837,K082440:603165,K185922:779908|0,0,0,0,0` TO rt_cases.
    APPEND `6|K208279:1,K056048:1,K913717:1,K493943:1,K091611:1|1,2,1,1,1` TO rt_cases.
    APPEND `-847897275903|K120090:1,K255375:1,K775801:1,K252863:1,K418797:1,K930812:1|-141316212651,-141316212651,-1413162`
        && `12650,-141316212651,-141316212650,-141316212650` TO rt_cases.
    APPEND `-569944847219|K708652:1,K100814:1,K153827:1,K260774:1,K760140:1,K133008:1,K908568:1,K882495:1,K650458:1|-63327`
        && `205246,-63327205247,-63327205247,-63327205247,-63327205246,-63327205247,-63327205246,-63327205246,-63327205247` TO rt_cases.
    APPEND `-79751056932|K420364:7,K014240:6,K397711:1,K376832:7,K833672:4,K388377:6,K921154:2|-16916890864,-14500192170,-`
        && `2416698695,-16916890864,-9666794780,-14500192169,-4833397390` TO rt_cases.
    APPEND `-609342588726|K203174:1,K915979:1,K725460:1,K460637:1,K662156:1,K044735:1,K638941:1,K656493:1,K994729:1,K80963`
        && `2:1,K055502:1,K578696:1,K387721:1,K844338:1|-43524470624,-43524470623,-43524470623,-43524470623,-43524470623,-`
        && `43524470624,-43524470623,-43524470623,-43524470623,-43524470623,-43524470624,-43524470623,-43524470624,-435244`
        && `70623` TO rt_cases.
    APPEND `14|K437503:1,K913257:1,K950176:1,K508320:1,K817543:1,K106118:1,K853382:1,K105676:1|2,1,1,2,2,2,2,2` TO rt_cases.
    APPEND `10|K142553:3,K136087:8,K503782:5,K625688:3,K016417:8,K408228:8,K813759:9,K660468:5|0,2,1,0,2,2,2,1` TO rt_cases.
    APPEND `-12|K958139:793487,K657715:100648,K440144:71346,K235127:813837,K543471:915400,K437407:371669,K801576:400617,K6`
        && `85720:229628|-3,0,0,-3,-3,-1,-1,-1` TO rt_cases.
    APPEND `-297444242579|K185157:6,K900968:7,K620948:1,K183015:1|-118977697032,-138807313203,-19829616172,-19829616172` TO rt_cases.
    APPEND `12|K411461:0,K112608:119541,K614292:871190,K594417:316862|0,1,8,3` TO rt_cases.
    APPEND `0|K951086:600921|0` TO rt_cases.
    APPEND `-23|K627006:217625,K229495:734054,K991169:390051,K114825:575180,K658216:44849,K606857:536952,K514118:21119,K16`
        && `5233:139164,K698903:670324,K456828:0|-1,-5,-3,-4,0,-4,0,-1,-5,0` TO rt_cases.
    APPEND `6|K340673:857548,K852130:694953,K957828:286104,K864117:434615,K925102:759967,K342045:219261,K009764:204279,K95`
        && `5657:150066,K937804:491895,K144421:485768,K116813:0,K564242:94216|1,1,0,1,1,0,0,0,1,1,0,0` TO rt_cases.
    APPEND `-13|K029430:4,K381750:2,K756273:1,K994800:0,K482906:8,K557194:4|-3,-1,-1,0,-5,-3` TO rt_cases.
    APPEND `-308639643204|K144370:1,K834668:1,K037898:1,K090833:1,K291020:1,K677051:1,K471673:1,K304379:1,K378417:1,K17932`
        && `7:1,K942040:1,K880609:1,K832820:1|-23741511016,-23741511015,-23741511016,-23741511016,-23741511016,-2374151101`
        && `6,-23741511016,-23741511016,-23741511016,-23741511016,-23741511015,-23741511015,-23741511015` TO rt_cases.
    APPEND `1|K624632:1,K933312:1|1,0` TO rt_cases.
    APPEND `-9|K462219:672734,K956662:502122,K551622:889680,K165011:0,K069156:777953,K867698:724305,K579859:827696,K585916`
        && `:386308,K992684:359746|-1,-1,-2,0,-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `9|K241356:260558,K916132:299077,K655487:937731,K392808:583786,K341932:0,K948499:285304,K810944:416296,K417370:`
        && `0,K520998:929615,K737544:570080,K167920:909450,K888516:134783|0,0,2,1,0,0,1,0,2,1,2,0` TO rt_cases.
    APPEND `9379719694|K254466:1,K503303:1,K064709:1,K695262:1,K982210:1,K347004:1,K434146:1|1339959957,1339959956,1339959`
        && `957,1339959956,1339959956,1339959956,1339959956` TO rt_cases.
    APPEND `26|K423042:712950,K186630:571490,K145229:749596,K771253:0,K673652:716542,K361144:749335,K956108:336538,K784842`
        && `:73645,K047893:0|5,4,5,0,5,5,2,0,0` TO rt_cases.
    APPEND `-1|K904219:930838|-1` TO rt_cases.
    APPEND `-7|K474654:381114,K303844:393444,K065840:0,K571935:635282,K452523:0,K295240:0,K205764:306378,K714701:876518|-1`
        && `,-1,0,-2,0,0,-1,-2` TO rt_cases.
    APPEND `0|K368652:1,K686109:1|0,0` TO rt_cases.
    APPEND `20|K780119:0,K713047:717410,K207148:686018,K303714:0,K154379:51494,K357951:864636,K624824:642484|0,5,5,0,0,6,4` TO rt_cases.
    APPEND `24|K433792:0,K992105:8,K516958:10,K076283:9,K928437:12,K592420:10,K897687:1,K163051:4,K864023:2,K122902:4,K414`
        && `203:10,K916318:4,K512981:3|0,3,3,3,4,3,0,1,1,1,3,1,1` TO rt_cases.
    APPEND `-8|K546770:1,K874431:1,K745543:1|-3,-2,-3` TO rt_cases.
    APPEND `-1289085621|K071024:426080,K835323:626556,K046296:995635,K503549:0,K219838:442140,K638993:572418,K622974:37858`
        && `7,K363545:704611,K357711:986554,K441337:333013,K420321:139992|-97983262,-144085619,-228960677,0,-101676491,-13`
        && `1635803,-87061559,-162035496,-226872369,-76581159,-32193186` TO rt_cases.
    APPEND `347209016076|K936592:1,K218784:1,K151795:1,K419935:1,K560700:1,K290676:1|57868169346,57868169346,57868169346,5`
        && `7868169346,57868169346,57868169346` TO rt_cases.
    APPEND `-6451388944|K562982:1,K515468:1,K253228:1,K938134:1,K042303:1,K990098:1,K739188:1,K636967:1,K867008:1,K369733:`
        && `1,K757873:1,K794195:1|-537615745,-537615746,-537615746,-537615745,-537615746,-537615745,-537615745,-537615745,`
        && `-537615745,-537615746,-537615745,-537615745` TO rt_cases.
    APPEND `582047870006|K910831:1,K022682:1,K040040:1,K945525:1,K123433:1,K036705:1,K187462:1|83149695715,83149695716,831`
        && `49695715,83149695715,83149695715,83149695715,83149695715` TO rt_cases.
    APPEND `288982053347|K653416:3,K560329:7,K047438:1|78813287276,183897670312,26271095759` TO rt_cases.
    APPEND `-24|K236694:930304,K025710:820440,K015050:0,K294560:0,K654965:933426,K529539:662265,K278018:389686,K450759:910`
        && `041|-5,-4,0,0,-5,-3,-2,-5` TO rt_cases.
    APPEND `475356487073|K224663:1,K741288:1,K133155:1,K761800:1,K193741:1,K168559:1,K199142:1,K801014:1,K791371:1|5281738`
        && `7453,52817387452,52817387453,52817387452,52817387453,52817387453,52817387453,52817387452,52817387452` TO rt_cases.
    APPEND `-735285090149|K977980:1,K576294:1|-367642545074,-367642545075` TO rt_cases.
    APPEND `-15|K679475:5,K587791:6,K561031:2,K952264:7,K635721:5|-3,-4,-1,-4,-3` TO rt_cases.
    APPEND `8|K275330:1,K567273:1,K161823:1,K362733:1|2,2,2,2` TO rt_cases.
    APPEND `-19|K881179:8,K500241:10,K138410:7,K871484:12,K090568:8,K135391:4,K452406:1,K338713:7|-3,-3,-2,-4,-3,-2,0,-2` TO rt_cases.
    APPEND `-5|K626956:592708,K796914:725837,K881750:355308,K178830:745062,K860784:641572,K530148:203375,K156378:118411|-1`
        && `,-1,-1,-1,-1,0,0` TO rt_cases.
    APPEND `4|K316491:0,K787479:716377,K778324:140205,K861130:577528,K283299:548826|0,2,0,1,1` TO rt_cases.
    APPEND `-69626918944|K889914:11,K105555:12,K024427:7,K683510:11,K474281:9,K753026:11,K149050:1,K417317:0,K570384:4,K61`
        && `0271:1,K600138:8,K322212:7,K293160:0|-9340196444,-10189305211,-5943761373,-9340196444,-7641978908,-9340196444,`
        && `-849108768,0,-3396435070,-849108768,-6792870141,-5943761373,0` TO rt_cases.
    APPEND `15|K906127:973930,K256324:168156,K894079:819101,K443907:168644,K477474:0,K444043:0,K583517:547999,K851419:2322`
        && `40,K424593:900362,K468173:0,K247228:362173,K973552:0,K686945:623028|3,0,3,0,0,0,2,1,3,0,1,0,2` TO rt_cases.
    APPEND `-9|K161613:368224,K745930:869920,K040579:731432,K959711:112296,K764447:825320,K420761:841178|-1,-2,-2,0,-2,-2` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_04.
    APPEND `459144007076|K424409:6,K984245:6|229572003538,229572003538` TO rt_cases.
    APPEND `0|K184116:790052,K039751:481512,K920232:0,K323979:312340,K225349:0,K576775:739610|0,0,0,0,0,0` TO rt_cases.
    APPEND `29|K092637:1,K128378:4,K336401:8,K953035:3,K346932:11,K284732:12,K965155:7,K413397:0,K541180:12,K740402:11,K90`
        && `6889:8,K396816:6,K074585:12,K509822:2|0,1,2,1,3,4,2,0,4,3,2,2,4,1` TO rt_cases.
    APPEND `-169381372663|K030841:8,K415652:2,K372746:2,K315818:7,K081423:2|-64526237205,-16131559301,-16131559301,-564604`
        && `57555,-16131559301` TO rt_cases.
    APPEND `5|K021770:666449,K101379:988692,K797931:368003,K502343:0|2,2,1,0` TO rt_cases.
    APPEND `-309925101349|K499871:11,K209427:4,K132041:12,K969833:4,K259978:3,K668119:3|-92139894996,-33505416362,-1005162`
        && `49086,-33505416362,-25129062272,-25129062271` TO rt_cases.
    APPEND `-9|K983920:660829,K437274:938507,K140579:329481,K621526:0,K634622:752164,K860060:105989,K134147:756304,K789781`
        && `:0,K953285:470459,K051791:111771|-1,-2,-1,0,-2,0,-2,0,-1,0` TO rt_cases.
    APPEND `10|K646989:12,K585315:11,K520402:10,K220944:3,K034633:4,K607951:10,K727469:9|2,2,2,0,1,2,1` TO rt_cases.
    APPEND `13|K628219:671926,K753309:378086,K233651:134498,K347306:515618,K005540:828748,K471499:350140,K678228:88918,K91`
        && `2710:355164,K920956:147093,K067126:130998|2,1,1,2,3,1,0,1,1,1` TO rt_cases.
    APPEND `-40|K246343:433191,K646674:468180,K885733:746194,K042574:286648,K237020:40546,K751410:499728,K167806:564513,K2`
        && `86498:0,K992682:502124,K000625:0,K544488:0,K096764:412768,K612907:841239,K574852:275485|-3,-4,-6,-2,0,-4,-5,0,`
        && `-4,0,0,-3,-7,-2` TO rt_cases.
    APPEND `7|K497825:562822,K484827:45926,K039523:677910|3,0,4` TO rt_cases.
    APPEND `-2|K787386:400103,K109751:114125,K803045:0|-2,0,0` TO rt_cases.
    APPEND `-17939170305|K003495:1,K861421:12,K750040:8,K016310:10,K061542:3,K611200:12,K524589:10,K131342:1,K113736:2,K31`
        && `5918:10,K400303:2,K664218:6|-232976238,-2795714853,-1863809902,-2329762377,-698928713,-2795714853,-2329762377,`
        && `-232976238,-465952476,-2329762377,-465952475,-1397857426` TO rt_cases.
    APPEND `-9|K145331:524446,K366511:150832,K242447:534718,K585822:0,K076530:460694,K634967:243955,K072511:949726,K267863`
        && `:835161|-1,-1,-1,0,-1,-1,-2,-2` TO rt_cases.
    APPEND `-2|K566157:7|-2` TO rt_cases.
    APPEND `-898222183427|K720463:1,K983624:1,K571035:1|-299407394476,-299407394475,-299407394476` TO rt_cases.
    APPEND `21|K858600:6,K812087:5,K295514:5,K867102:8,K759769:3,K705586:2,K337855:12|3,3,3,4,1,1,6` TO rt_cases.
    APPEND `-105744773093|K654779:1,K467348:1,K413429:1,K504409:1,K746642:1,K289627:1,K575798:1,K502321:1,K377569:1,K09167`
        && `7:1,K765761:1,K096267:1|-8812064424,-8812064424,-8812064425,-8812064424,-8812064424,-8812064425,-8812064424,-8`
        && `812064424,-8812064425,-8812064425,-8812064424,-8812064425` TO rt_cases.
    APPEND `13|K459596:9,K767117:7,K303856:4,K882930:3,K680124:12,K319183:9,K307608:1,K314143:0,K585561:2,K102643:0|2,2,1,`
        && `1,3,3,0,0,1,0` TO rt_cases.
    APPEND `3|K128044:1,K260932:1,K535041:1,K084570:1,K908944:1,K048276:1,K003061:1,K734771:1,K024102:1|0,0,0,0,0,1,1,0,1` TO rt_cases.
    APPEND `19|K329073:1,K338772:1,K043176:1,K799037:1,K016800:1,K446787:1,K982562:1,K593207:1,K637053:1,K950056:1,K507912`
        && `:1|2,2,2,1,2,2,1,2,2,1,2` TO rt_cases.
    APPEND `-190585419288|K588257:1,K026038:1,K031787:1,K403805:1,K247887:1,K976220:1,K220499:1,K516109:1,K092519:1|-21176`
        && `157698,-21176157699,-21176157699,-21176157699,-21176157699,-21176157698,-21176157699,-21176157698,-21176157699` TO rt_cases.
    APPEND `198064549964|K843748:1,K490055:1,K312456:1,K893866:1,K233810:1,K596776:1,K864656:1,K674817:1,K743680:1,K698275`
        && `:1|19806454996,19806454997,19806454997,19806454996,19806454997,19806454997,19806454996,19806454996,19806454996`
        && `,19806454996` TO rt_cases.
    APPEND `629376323593|K025476:1,K910237:1|314688161797,314688161796` TO rt_cases.
    APPEND `-221963505381|K468645:1,K764126:1,K947052:1,K171929:1|-55490876345,-55490876345,-55490876345,-55490876346` TO rt_cases.
    APPEND `10|K596850:327215,K960379:440551,K246902:168754,K942296:895981|2,2,1,5` TO rt_cases.
    APPEND `-14|K559314:646582,K668443:894327,K951907:0,K892179:83748,K964810:443169,K996562:439750,K980786:732438,K101896`
        && `:404763|-2,-3,0,0,-2,-2,-3,-2` TO rt_cases.
    APPEND `12|K711498:1,K218492:1,K330431:1,K029423:1|3,3,3,3` TO rt_cases.
    APPEND `-438839076654|K268668:1,K771697:1,K935355:1,K297638:1,K656090:1,K524381:1,K056577:1,K650715:1,K322868:1|-48759`
        && `897406,-48759897406,-48759897406,-48759897406,-48759897406,-48759897406,-48759897406,-48759897406,-48759897406` TO rt_cases.
    APPEND `11|K704781:11,K787601:12,K727449:5,K416282:1|4,5,2,0` TO rt_cases.
    APPEND `-887960092627|K962842:1,K148486:1,K557278:1,K908346:1,K925098:1,K882054:1,K157907:1,K725030:1,K186051:1,K59690`
        && `6:1|-88796009262,-88796009263,-88796009263,-88796009262,-88796009262,-88796009263,-88796009263,-88796009263,-8`
        && `8796009263,-88796009263` TO rt_cases.
    APPEND `-5|K399873:1,K790628:1|-3,-2` TO rt_cases.
    APPEND `8|K490661:0,K562255:1,K875419:10|0,1,7` TO rt_cases.
    APPEND `29|K678844:1,K522280:1,K084320:1,K100802:1,K472042:1,K753496:1,K449614:1,K330620:1,K276081:1,K777709:1|3,3,3,3`
        && `,3,3,3,3,3,2` TO rt_cases.
    APPEND `-3|K151557:1,K565669:0|-3,0` TO rt_cases.
    APPEND `-6|K502030:1,K898372:1,K297150:1,K942262:1,K974697:1,K139173:1|-1,-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `-378932640653|K557148:1,K265048:1,K898352:1,K007340:1,K924952:1,K356045:1,K285895:1,K764913:1,K720092:1,K28058`
        && `8:1,K828059:1,K345356:1,K225892:1,K551768:1|-27066617189,-27066617190,-27066617189,-27066617190,-27066617189,-`
        && `27066617190,-27066617190,-27066617189,-27066617189,-27066617190,-27066617189,-27066617190,-27066617190,-270666`
        && `17189` TO rt_cases.
    APPEND `-7|K605486:663663,K360440:74912,K899621:799894,K338109:393135,K404980:329478,K750431:125917,K265589:124628,K87`
        && `2540:575337,K121474:264113,K611684:0,K024043:102753|-1,0,-2,-1,-1,0,0,-1,-1,0,0` TO rt_cases.
    APPEND `-14|K309543:0,K218286:5,K138446:12,K048250:1,K914056:4,K918300:7,K026506:0,K355334:0|0,-2,-6,-1,-2,-3,0,0` TO rt_cases.
    APPEND `3|K121926:0,K132335:1|0,3` TO rt_cases.
    APPEND `-2|K844535:2,K850585:7,K424330:5,K778326:5,K464406:12,K991445:11|0,0,0,0,-1,-1` TO rt_cases.
    APPEND `980801034722|K209784:1,K044849:1,K898164:1,K463006:1,K495781:1,K801488:1,K993817:1,K496719:1,K626252:1,K509739`
        && `:1,K806772:1,K538108:1,K717142:1|75446233441,75446233441,75446233440,75446233440,75446233440,75446233440,75446`
        && `233440,75446233440,75446233440,75446233440,75446233440,75446233440,75446233440` TO rt_cases.
    APPEND `28|K927375:420652,K503433:58237,K231866:358168,K000548:97743,K243118:414553,K036517:800166,K446681:233176,K190`
        && `470:476717,K843940:563219,K014820:394425,K411178:781751,K479839:756510,K540903:0|2,0,2,1,2,4,1,3,3,2,4,4,0` TO rt_cases.
    APPEND `139816000009|K309217:1,K378380:1,K890596:1,K256053:1,K406831:1,K724852:1,K394974:1,K058140:1,K080938:1,K425508`
        && `:1,K911172:1,K764251:1,K837028:1,K321343:1|9986857144,9986857144,9986857143,9986857144,9986857143,9986857143,9`
        && `986857144,9986857144,9986857144,9986857143,9986857143,9986857143,9986857143,9986857144` TO rt_cases.
    APPEND `4|K619405:203266,K285838:3941,K687755:0,K838246:906495,K475189:646689,K643175:875452,K309676:451826,K475716:33`
        && `9995,K160184:151438,K760629:0,K502931:684741|0,0,0,1,1,1,0,0,0,0,1` TO rt_cases.
    APPEND `247861055636|K023492:11|247861055636` TO rt_cases.
    APPEND `15|K994083:6,K943091:6,K427699:1,K378904:11,K296066:8|3,3,0,5,4` TO rt_cases.
    APPEND `0|K802235:12,K096793:3,K206443:11,K494065:1,K244584:4,K149641:11,K465269:6,K609214:3,K066790:7,K858936:0,K3540`
        && `50:1,K605622:0,K297186:12|0,0,0,0,0,0,0,0,0,0,0,0,0` TO rt_cases.
    APPEND `235379383295|K009909:8,K574377:9,K718464:12,K046496:3,K645850:1,K722664:9,K076865:9,K139355:11,K314541:6,K2147`
        && `89:1,K280222:11,K051157:0,K890575:8,K313887:3|20692693037,23279279666,31039039555,7759759889,2586586630,232792`
        && `79666,23279279666,28452452926,15519519778,2586586630,28452452926,0,20692693037,7759759889` TO rt_cases.
    APPEND `23|K267502:98831,K856192:644501,K672587:0,K808296:0,K112843:889623,K693364:0,K082429:959523,K310014:163280,K35`
        && `8699:946185,K304956:659249,K665297:320036,K727640:405632|0,3,0,0,4,0,4,1,4,3,2,2` TO rt_cases.
    APPEND `-6|K725985:1,K372096:1,K379913:1|-2,-2,-2` TO rt_cases.
    APPEND `197837382446|K212108:4,K515001:8,K555831:10,K816671:1|34406501295,68813002590,86016253237,8601625324` TO rt_cases.
    APPEND `9|K335086:5,K306313:3,K279512:10,K845172:8,K596926:7,K528879:1,K229054:0,K059524:1,K907842:7,K448514:7|1,1,2,2`
        && `,1,0,0,0,1,1` TO rt_cases.
    APPEND `-1|K411971:1,K833220:1,K896514:1|-1,0,0` TO rt_cases.
    APPEND `492229330916|K333143:8,K919820:11,K893055:5,K443207:4,K973056:1,K108232:0,K255799:11,K279418:0,K532895:3,K5846`
        && `18:4,K927594:9,K258590:4|65630577455,90242044001,41019110910,32815288728,8203822182,0,90242044001,0,2461146654`
        && `6,32815288728,73834399637,32815288728` TO rt_cases.
    APPEND `709478485735|K489793:1,K399349:1,K883623:1,K121313:1|177369621434,177369621434,177369621433,177369621434` TO rt_cases.
    APPEND `6|K287447:2,K196891:11|1,5` TO rt_cases.
    APPEND `914856046909|K338396:4,K067864:8,K694308:0|304952015636,609904031273,0` TO rt_cases.
    APPEND `-379599118037|K219108:1,K116291:1,K534382:1,K353878:1,K911630:1,K788774:1,K839621:1,K529810:1,K139658:1,K24489`
        && `2:1,K972362:1,K913603:1,K164899:1|-29199932157,-29199932157,-29199932157,-29199932157,-29199932156,-2919993215`
        && `7,-29199932156,-29199932157,-29199932157,-29199932157,-29199932156,-29199932156,-29199932157` TO rt_cases.
    APPEND `965740281925|K757141:1,K363613:1,K077951:1,K721395:1,K963826:1|193148056385,193148056385,193148056385,19314805`
        && `6385,193148056385` TO rt_cases.
    APPEND `13|K806636:1,K015922:1,K611769:1,K753267:1,K451661:1,K175488:1,K442162:1,K591947:1,K077468:1|1,2,1,1,1,2,2,1,2` TO rt_cases.
    APPEND `882717396862|K167055:1|882717396862` TO rt_cases.
    APPEND `6|K977262:1,K455484:1,K516610:1,K858479:1,K215189:1,K880211:1|1,1,1,1,1,1` TO rt_cases.
    APPEND `19|K440582:1,K551868:1,K021960:1,K097137:1,K583249:1,K756851:1,K698072:1,K141743:1,K201946:1,K236384:1,K274860`
        && `:1,K155790:1,K283370:1|1,1,2,2,1,1,1,2,2,2,1,2,1` TO rt_cases.
    APPEND `-35|K233363:0,K231495:11,K287245:1,K069881:0,K208307:4,K335105:5,K743631:5,K944651:4,K009817:9,K699036:4,K4548`
        && `11:6,K662248:9|0,-7,-1,0,-2,-3,-3,-2,-6,-2,-4,-5` TO rt_cases.
    APPEND `-840554707341|K000400:1|-840554707341` TO rt_cases.
    APPEND `-291810570075|K087682:1|-291810570075` TO rt_cases.
    APPEND `4|K210865:924806,K992836:145691,K945860:0,K356682:810589,K714929:913799,K219549:0,K536660:0,K321758:86829|2,0,`
        && `0,1,1,0,0,0` TO rt_cases.
    APPEND `-177676196565|K092465:12,K436069:7,K000242:0,K237835:9,K729096:7,K849218:0,K342746:9|-48457144518,-28266667636`
        && `,0,-36342858388,-28266667635,0,-36342858388` TO rt_cases.
    APPEND `914424249779|K415017:5,K882541:9,K245179:6,K064163:2,K537650:4,K285773:12|120318980234,216574164421,1443827762`
        && `81,48127592094,96255184187,288765552562` TO rt_cases.
    APPEND `-905941907709|K166298:1,K623540:1,K102593:1|-301980635903,-301980635903,-301980635903` TO rt_cases.
    APPEND `-644473653|K310937:263420,K689697:785959,K253494:0,K346918:498082,K674240:0,K251326:0,K852173:749868|-73897665`
        && `,-220486429,0,-139727800,0,0,-210361759` TO rt_cases.
    APPEND `10|K461113:349187,K705070:233672,K975073:0,K486097:858215,K415335:978562,K713764:0|1,1,0,4,4,0` TO rt_cases.
    APPEND `-765179440849|K879603:0,K181397:1|0,-765179440849` TO rt_cases.
    APPEND `6|K103169:145455,K304250:0,K399698:307151,K474463:883167,K418014:377786,K952721:884947,K515556:0|0,0,1,2,1,2,0` TO rt_cases.
    APPEND `1|K185090:1,K147777:1|0,1` TO rt_cases.
    APPEND `-2|K350160:1,K710658:1|-1,-1` TO rt_cases.
    APPEND `867074346343|K619882:1,K511674:1|433537173171,433537173172` TO rt_cases.
    APPEND `-11|K091753:502757,K882793:0,K997403:263897,K980718:54600|-7,0,-3,-1` TO rt_cases.
    APPEND `1|K430679:835899,K056004:907363,K284248:0,K580467:295755,K216607:325751,K460086:775131,K834047:768166,K358551:`
        && `922767,K139150:363110,K038229:482022,K109745:0,K203703:333092|0,0,0,0,0,0,0,1,0,0,0,0` TO rt_cases.
    APPEND `-342163220|K480534:386942,K946854:0,K355667:0,K414391:489459,K829853:0|-151069340,0,0,-191093880,0` TO rt_cases.
    APPEND `477957871233|K195085:1,K136746:1,K225644:1,K904794:1,K819306:1,K832011:1,K570402:1,K189252:1,K716557:1,K081046`
        && `:1,K529481:1,K924484:1|39829822603,39829822603,39829822603,39829822602,39829822603,39829822602,39829822603,398`
        && `29822603,39829822603,39829822603,39829822603,39829822602` TO rt_cases.
    APPEND `419460894872|K427701:1,K490327:1,K332388:1,K328554:1,K371763:1,K160790:1,K503232:1,K528997:1,K727572:1|4660676`
        && `6097,46606766097,46606766097,46606766097,46606766097,46606766097,46606766097,46606766097,46606766096` TO rt_cases.
    APPEND `-10|K231780:1,K885233:1,K718428:1,K127971:1,K712158:1,K594175:1,K407450:1,K593280:1,K388059:1,K903869:1,K54791`
        && `8:1|-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1` TO rt_cases.
    APPEND `25|K058283:958674,K358916:180632,K746925:387953,K757254:0,K744520:223011,K286206:0,K810990:759273,K301124:2167`
        && `9,K964968:242802,K010662:248123,K702889:126081|8,1,3,0,2,0,6,0,2,2,1` TO rt_cases.
    APPEND `289074586309|K671482:4,K711595:11,K676047:10,K947081:10,K448102:4,K911484:8,K990409:7,K515256:9,K994470:12,K05`
        && `6214:0,K589478:0|15417311270,42397605992,38543278175,38543278174,15417311270,30834622540,26980294722,346889503`
        && `57,46251933809,0,0` TO rt_cases.
    APPEND `9|K153264:1,K965983:1,K943460:1,K391797:1,K193711:1,K585718:1|2,1,1,2,2,1` TO rt_cases.
    APPEND `840888857231|K486211:1,K840933:1,K399718:1,K859388:1,K369710:1,K512407:1,K154615:1,K320766:1,K825680:1,K254637`
        && `:1,K897460:1,K309252:1|70074071436,70074071436,70074071436,70074071436,70074071436,70074071436,70074071436,700`
        && `74071436,70074071436,70074071436,70074071435,70074071436` TO rt_cases.
    APPEND `-3|K752538:2,K090410:1,K684575:10|-1,0,-2` TO rt_cases.
    APPEND `10|K883578:0,K583164:0,K508707:0,K517708:843991,K454013:814583,K138687:896887,K747625:123180|0,0,0,3,3,3,1` TO rt_cases.
    APPEND `-28|K865542:76345,K535872:0,K268577:8208,K312313:556525,K615465:173442,K640659:610453,K357347:958029,K245538:9`
        && `35336,K062967:772774,K100055:381037,K397372:753153|-1,0,0,-3,-1,-3,-5,-5,-4,-2,-4` TO rt_cases.
    APPEND `14|K251879:496699,K707540:732999,K510130:562709,K001754:660538,K266839:786366,K204600:0,K539213:635679,K130060`
        && `:230392|2,2,2,2,3,0,2,1` TO rt_cases.
    APPEND `-1|K848576:1,K126661:1,K194013:1|0,-1,0` TO rt_cases.
    APPEND `-13|K454477:268443,K192451:410976,K260126:309250,K680409:128979,K464613:0,K079212:427824|-2,-3,-3,-1,0,-4` TO rt_cases.
    APPEND `4|K448575:0,K532276:7,K096277:8,K923817:0,K467218:10,K144656:1,K014978:3,K782877:5,K660462:8,K885272:0|0,1,1,0`
        && `,1,0,0,0,1,0` TO rt_cases.
    APPEND `-26|K914613:589663,K780296:160855,K331211:0,K453212:283177,K379784:692455,K372389:0,K057499:220985,K625732:244`
        && `276,K943110:0,K711398:201348,K794954:613634|-5,-1,0,-3,-6,0,-2,-2,0,-2,-5` TO rt_cases.
    APPEND `25|K495217:864193,K733273:0,K239390:0,K579589:0,K773743:585733,K692980:97255,K915992:190569,K065613:338689,K49`
        && `0921:0|11,0,0,0,7,1,2,4,0` TO rt_cases.
    APPEND `-17|K353323:5,K031543:12,K516111:3,K555752:3,K850986:9,K747880:7,K396796:0,K845988:11,K501137:11|-1,-3,-1,-1,-`
        && `3,-2,0,-3,-3` TO rt_cases.
    APPEND `-253501175492|K390841:1,K203803:1,K082594:1,K376947:1,K464730:1,K376018:1,K343501:1,K333867:1|-31687646936,-31`
        && `687646937,-31687646937,-31687646936,-31687646936,-31687646936,-31687646937,-31687646937` TO rt_cases.
    APPEND `-3|K942912:142949,K321478:0,K774972:0,K087242:0,K272037:60015,K013246:0,K615333:442693|-1,0,0,0,0,0,-2` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_05.
    APPEND `-990911803557|K994020:1,K041956:1,K332476:1,K127941:1,K401504:1,K376144:1,K269800:1,K475895:1,K420812:1,K01116`
        && `8:1,K391100:1|-90082891232,-90082891233,-90082891233,-90082891233,-90082891232,-90082891232,-90082891233,-9008`
        && `2891232,-90082891232,-90082891233,-90082891232` TO rt_cases.
    APPEND `-13|K175809:6,K102178:8,K436077:9,K355937:2,K808586:11,K246367:0,K604708:1,K227438:9|-2,-2,-2,-1,-3,0,0,-3` TO rt_cases.
    APPEND `-782183512958|K329642:1,K251981:1,K429786:1,K256376:1,K738277:1|-156436702592,-156436702592,-156436702591,-156`
        && `436702592,-156436702591` TO rt_cases.
    APPEND `7|K503196:0,K341851:1,K147470:6,K038844:8|0,0,3,4` TO rt_cases.
    APPEND `-4|K282241:736888,K508340:194621,K251951:375491,K738035:0,K788945:283780,K105100:212117|-2,0,-1,0,-1,0` TO rt_cases.
    APPEND `16|K982074:642487,K072256:790837,K621906:800455,K726321:134541,K843527:285248,K595025:847775,K542805:357567,K0`
        && `53214:882234,K795823:0|2,3,3,0,1,3,1,3,0` TO rt_cases.
    APPEND `16|K773748:1,K640362:1,K921016:1,K573126:1,K777788:1,K333856:1|3,3,2,3,2,3` TO rt_cases.
    APPEND `-244046196781|K877932:1,K845840:1,K437221:1,K558361:1,K903447:1,K506501:1,K569347:1,K734640:1,K173540:1,K77891`
        && `9:1,K935330:1,K466713:1|-20337183065,-20337183065,-20337183065,-20337183065,-20337183065,-20337183065,-2033718`
        && `3065,-20337183065,-20337183066,-20337183065,-20337183065,-20337183065` TO rt_cases.
    APPEND `3|K722688:4,K566152:10,K465274:2,K985577:7,K061642:6,K446168:2,K116158:6|0,1,0,1,1,0,0` TO rt_cases.
    APPEND `26|K469363:0,K240701:506024,K624767:892216,K028997:0,K655244:920209,K576793:930505,K678950:0,K487706:684149,K1`
        && `03338:388648,K501690:196248,K864528:0,K334481:0,K565897:471792,K757221:36461|0,3,5,0,5,5,0,3,2,1,0,0,2,0` TO rt_cases.
    APPEND `-846343113547|K425866:1,K877707:1,K189612:1,K258124:1,K049313:1,K646558:1,K642130:1,K539297:1,K111649:1,K75294`
        && `1:1,K988175:1|-76940283050,-76940283049,-76940283050,-76940283050,-76940283050,-76940283050,-76940283050,-7694`
        && `0283050,-76940283050,-76940283049,-76940283049` TO rt_cases.
    APPEND `-23|K069512:12,K864140:8,K500621:4,K042058:3,K773277:2,K122108:7,K646731:7,K982774:3,K876020:4,K996624:1,K3860`
        && `81:4,K591367:4,K809138:5|-4,-3,-1,-1,-1,-3,-3,-1,-1,0,-2,-1,-2` TO rt_cases.
    APPEND `-8|K376449:1,K811573:1,K197603:1,K948337:1,K282566:1,K504234:1,K255097:1,K129907:1,K960615:1|-1,-1,-1,-1,-1,-1`
        && `,-1,-1,0` TO rt_cases.
    APPEND `20|K246662:1,K780351:1,K327931:1,K001207:1,K059582:1,K196330:1,K945231:1,K094959:1,K279265:1,K678633:1,K890160`
        && `:1,K998474:1,K796243:1|2,1,2,2,2,2,1,2,2,1,1,1,1` TO rt_cases.
    APPEND `3|K168786:844928,K274229:591091,K442066:981053,K947149:300517,K978363:520298,K267444:598682,K660144:899182,K99`
        && `3243:440124,K952105:337094,K651681:432904,K295069:277368,K746943:514584,K327131:48842,K387993:648158|1,0,1,0,0`
        && `,0,1,0,0,0,0,0,0,0` TO rt_cases.
    APPEND `5|K206143:1485,K016809:0,K611292:518585|0,0,5` TO rt_cases.
    APPEND `23|K045695:457785,K140998:0,K487732:70269,K506755:532489,K735823:251167,K129384:260747,K138069:0,K214204:93509`
        && `3|4,0,1,5,2,2,0,9` TO rt_cases.
    APPEND `-603108849438|K089403:1,K343610:1,K849729:1,K245233:1,K464362:1,K506072:1,K679405:1,K880239:1,K120838:1,K14072`
        && `4:1,K202777:1,K731379:1,K984449:1,K345091:1|-43079203532,-43079203531,-43079203531,-43079203531,-43079203531,-`
        && `43079203531,-43079203531,-43079203531,-43079203532,-43079203532,-43079203532,-43079203531,-43079203531,-430792`
        && `03531` TO rt_cases.
    APPEND `-28|K179652:255921,K681639:495659,K957020:634422,K969203:0,K564483:186040,K875140:998543,K193935:664433,K26977`
        && `8:0,K172682:550505,K975535:272184,K250759:65547,K411807:912940|-1,-3,-4,0,-1,-6,-4,0,-3,-1,0,-5` TO rt_cases.
    APPEND `1|K682411:0,K058353:0,K471589:338444,K734445:497499,K962106:0,K578004:0,K260972:0,K397396:644384,K736822:0,K99`
        && `1729:925558,K673437:0,K741843:260497,K002089:622242,K202847:0|0,0,0,0,0,0,0,0,0,1,0,0,0,0` TO rt_cases.
    APPEND `-6|K747389:10,K902481:8,K606113:5|-3,-2,-1` TO rt_cases.
    APPEND `3|K556394:1|3` TO rt_cases.
    APPEND `-240657473943|K002607:1,K008822:1,K861434:1,K223236:1,K736021:1,K734464:1|-40109578991,-40109578991,-401095789`
        && `90,-40109578991,-40109578990,-40109578990` TO rt_cases.
    APPEND `439415608825|K344817:1,K962564:1,K414334:1,K019162:1,K924332:1,K656853:1,K607505:1,K044615:1,K932514:1,K074378`
        && `:1,K126562:1,K684937:1|36617967402,36617967402,36617967402,36617967403,36617967402,36617967402,36617967402,366`
        && `17967402,36617967402,36617967402,36617967402,36617967402` TO rt_cases.
    APPEND `9|K798034:1,K120762:1,K247707:1|3,3,3` TO rt_cases.
    APPEND `-957281200202|K569895:2,K400893:1,K797029:4,K802176:10,K192455:5,K704659:2,K628454:11,K506034:5,K806584:7,K400`
        && `417:8,K741493:11,K058727:0,K589795:0|-29008521218,-14504260609,-58017042437,-145042606091,-72521303046,-290085`
        && `21218,-159546866700,-72521303046,-101529824264,-116034084873,-159546866700,0,0` TO rt_cases.
    APPEND `-20|K322961:0,K362000:943062,K339195:869771,K645221:0,K164658:759572,K344661:504456,K389658:0,K133791:895997,K`
        && `820669:695758,K539410:441378|0,-4,-3,0,-3,-2,0,-3,-3,-2` TO rt_cases.
    APPEND `-116142386528|K679890:8,K454781:6,K605724:10,K212441:10,K372768:8,K141965:0,K474568:1|-21607885866,-1620591439`
        && `9,-27009857332,-27009857332,-21607885866,0,-2700985733` TO rt_cases.
    APPEND `-3|K022488:911468|-3` TO rt_cases.
    APPEND `2|K192962:707421|2` TO rt_cases.
    APPEND `-6|K472053:0,K200117:2,K649462:1,K175540:6,K025237:6|0,-1,0,-2,-3` TO rt_cases.
    APPEND `8|K756620:440280,K507859:69594,K999989:745731,K586878:598205|2,0,3,3` TO rt_cases.
    APPEND `20|K031469:687927,K729375:0,K946962:32691,K115294:356438,K969393:0,K583984:102573,K354551:0,K663511:56385|11,0`
        && `,0,6,0,2,0,1` TO rt_cases.
    APPEND `2|K116834:1|2` TO rt_cases.
    APPEND `-20|K815647:120740,K687572:303251,K745208:0,K317725:741101,K099859:859200,K741510:636447,K636845:655821,K15118`
        && `1:589414,K054109:355854|-1,-1,0,-3,-4,-3,-3,-3,-2` TO rt_cases.
    APPEND `12|K667576:1,K888633:1,K420555:1,K432103:1,K219825:1,K605873:1,K023915:1,K400149:1,K590837:1,K364899:1|1,1,1,1`
        && `,2,1,2,1,1,1` TO rt_cases.
    APPEND `-5|K268872:333183,K916891:650687,K722219:838738,K033440:171205,K634932:428937,K298966:720698,K139498:0|-1,-1,-`
        && `1,0,-1,-1,0` TO rt_cases.
    APPEND `-33933950174|K038036:10,K589943:12,K971768:1,K588714:5,K055710:3|-10946435540,-13135722648,-1094643554,-547321`
        && `7770,-3283930662` TO rt_cases.
    APPEND `-814775029270|K128822:11,K965808:7,K567509:1,K640721:8,K454436:2,K415114:8,K312173:1,K200394:11|-182908680040,`
        && `-116396432753,-16628061822,-133024494575,-33256123643,-133024494575,-16628061822,-182908680040` TO rt_cases.
    APPEND `-19|K532812:7785,K436490:875565,K608245:551284,K171096:311460,K096290:642696,K589588:689101,K533657:546043,K45`
        && `7006:502789,K090238:610127|0,-4,-2,-1,-3,-3,-2,-2,-2` TO rt_cases.
    APPEND `-8|K057639:515737,K534145:126181,K847608:33860|-6,-2,0` TO rt_cases.
    APPEND `678636582581|K364806:11,K586290:10,K287385:6,K993441:1,K877214:0,K190843:0,K702851:9,K934379:1,K285254:11,K451`
        && `915:12,K350946:12|102260306964,92963915422,55778349253,9296391542,0,0,83667523880,9296391542,102260306964,1115`
        && `56698507,111556698507` TO rt_cases.
    APPEND `-518718148215|K284663:0,K923931:10,K542644:9,K994297:0,K263092:5,K914482:0,K126915:4,K957751:10,K252145:5|0,-1`
        && `20632127492,-108568914742,0,-60316063746,0,-48252850997,-120632127492,-60316063746` TO rt_cases.
    APPEND `496288860373|K523492:1,K286458:1,K800452:1,K924609:1,K168267:1,K421013:1,K512042:1,K401563:1,K781580:1,K345298`
        && `:1,K703961:1,K689071:1,K194047:1,K019104:1|35449204312,35449204313,35449204312,35449204312,35449204313,3544920`
        && `4312,35449204312,35449204312,35449204312,35449204313,35449204312,35449204312,35449204313,35449204313` TO rt_cases.
    APPEND `-871348088488|K616808:1,K372802:1|-435674044244,-435674044244` TO rt_cases.
    APPEND `-8|K985591:929362,K820856:588557,K215126:527995,K228824:84658|-4,-2,-2,0` TO rt_cases.
    APPEND `8|K584699:1,K166690:1,K753017:1,K582719:1|2,2,2,2` TO rt_cases.
    APPEND `6|K513548:399686,K461485:0,K705291:0,K179384:664780,K076061:723852,K858390:766573,K428047:327941|1,0,0,1,1,2,1` TO rt_cases.
    APPEND `-634064244775|K502490:1,K066216:1,K491269:1,K610018:1|-158516061194,-158516061194,-158516061194,-158516061193` TO rt_cases.
    APPEND `3|K949934:0,K176527:0,K317259:0,K933351:669867,K818925:563365,K784614:607894,K741650:936933,K015930:184160,K80`
        && `6219:900569|0,0,0,1,0,0,1,0,1` TO rt_cases.
    APPEND `1|K944421:4|1` TO rt_cases.
    APPEND `1|K578884:830320,K876873:243981,K530774:374163|1,0,0` TO rt_cases.
    APPEND `8|K737126:1,K119453:1,K994367:1|3,3,2` TO rt_cases.
    APPEND `-19|K517303:613329,K079528:0,K557322:0,K867573:440383,K473196:0,K223666:881036,K744712:588281,K778724:525316|-`
        && `4,0,0,-3,0,-5,-4,-3` TO rt_cases.
    APPEND `-860790772484|K533623:1,K194779:1|-430395386242,-430395386242` TO rt_cases.
    APPEND `328611382979|K507682:1,K896684:10,K838585:4,K634295:7,K969152:0|14936881045,149368810445,59747524178,104558167`
        && `311,0` TO rt_cases.
    APPEND `4|K363994:1,K260227:1,K947409:1,K261464:1,K037754:1,K116030:1|0,1,0,1,1,1` TO rt_cases.
    APPEND `-2791327508|K093029:3,K445668:1,K179790:12,K810148:4,K204929:8|-299070804,-99690268,-1196283218,-398761073,-79`
        && `7522145` TO rt_cases.
    APPEND `-1|K709833:603845|-1` TO rt_cases.
    APPEND `491448631054|K489742:6,K958668:1,K242337:10,K844963:8,K513103:5,K964229:12,K199246:10,K456355:2,K131911:5,K693`
        && `477:4,K085244:5,K251600:8,K929860:8|35103473647,5850578941,58505789411,46804631529,29252894706,70206947293,585`
        && `05789411,11701157882,29252894706,23402315764,29252894706,46804631529,46804631529` TO rt_cases.
    APPEND `-9|K882719:990301,K086961:0,K215646:314664,K642303:361850,K875912:705673,K261662:655771,K180329:134784,K397144`
        && `:531887|-2,0,-1,-1,-2,-2,0,-1` TO rt_cases.
    APPEND `7|K305256:268808,K200767:67271,K226413:0,K875079:151677|4,1,0,2` TO rt_cases.
    APPEND `33|K845835:71372,K700790:340676,K702956:199953,K639676:532392,K999228:0,K725306:813884,K736995:790235,K762134:`
        && `0,K324739:238947,K470291:644450,K279884:87629,K484353:584420,K607257:623231,K168493:604593|0,2,1,3,0,5,5,0,1,4`
        && `,1,3,4,4` TO rt_cases.
    APPEND `-630598168761|K585652:1,K564995:1|-315299084380,-315299084381` TO rt_cases.
    APPEND `-14|K925807:1,K612551:1,K259019:1,K909799:1,K297579:1|-2,-3,-3,-3,-3` TO rt_cases.
    APPEND `28|K439478:312124,K420665:205006,K012193:170749,K267682:856286,K009890:421181,K160932:843273,K134640:0,K033838`
        && `:280094,K013942:666489,K270171:91786,K345339:536491,K538304:367835,K060793:0,K005315:457917|2,1,1,5,2,5,0,1,4,`
        && `0,3,2,0,2` TO rt_cases.
    APPEND `929260689949|K076988:1,K786946:1,K536406:1|309753563317,309753563316,309753563316` TO rt_cases.
    APPEND `22|K925872:3,K546771:5,K412722:12,K563723:9,K146510:4,K147630:8,K071086:3,K928231:4,K977681:6,K611260:8,K28824`
        && `0:8,K810649:12|1,1,3,3,1,2,1,1,2,2,2,3` TO rt_cases.
    APPEND `465653499660|K236281:6,K201999:9,K696046:11,K857128:2,K279241:4,K353592:2,K488247:8,K238945:9,K272775:10,K8717`
        && `67:5,K394886:7|38272890383,57409335575,70166965702,12757630128,25515260255,12757630128,51030520511,57409335574`
        && `,63788150638,31894075319,44651705447` TO rt_cases.
    APPEND `-3|K476350:563500,K219953:374247|-2,-1` TO rt_cases.
    APPEND `-1|K994972:1,K776194:4,K347169:10,K784240:1|0,0,-1,0` TO rt_cases.
    APPEND `-40|K106328:12,K451344:5,K367836:11,K341989:2,K841118:11,K782769:6,K454488:9,K054789:12,K240045:8,K038444:3,K1`
        && `66981:3,K563861:0,K570068:8,K710718:10|-5,-2,-5,-1,-4,-2,-4,-5,-3,-1,-1,0,-3,-4` TO rt_cases.
    APPEND `584522662083|K194970:11,K431985:10,K042371:2,K602137:9,K143244:9,K646043:3,K877329:10,K600416:5|108978801405,9`
        && `9071637641,19814327528,89164473877,89164473877,29721491293,99071637641,49535818821` TO rt_cases.
    APPEND `747329381780|K955925:10,K458355:7,K308661:1,K448626:1,K395580:2,K965593:5,K623190:10|207591494939,145314046457`
        && `,20759149494,20759149494,41518298988,103795747469,207591494939` TO rt_cases.
    APPEND `6|K161231:6,K140186:1,K831214:10,K553242:3|2,0,3,1` TO rt_cases.
    APPEND `-5|K966718:1,K067874:1|-2,-3` TO rt_cases.
    APPEND `7|K290989:1,K713389:5,K357513:7,K202661:2,K944913:0|1,2,3,1,0` TO rt_cases.
    APPEND `676042921620|K898278:1,K878168:1,K310346:1,K119503:1,K544892:1,K133405:1,K504118:1,K676491:1|84505365202,84505`
        && `365202,84505365203,84505365203,84505365202,84505365203,84505365203,84505365202` TO rt_cases.
    APPEND `-30|K489187:220472,K156109:0,K235774:0,K826736:882793,K688874:81337,K559628:0,K052466:454173,K066194:282289,K9`
        && `76458:429393,K990702:645281,K938679:0,K114809:726987|-2,0,0,-7,-1,0,-4,-2,-3,-5,0,-6` TO rt_cases.
    APPEND `3|K638612:780875,K098389:0,K509366:154554,K022282:586315|2,0,0,1` TO rt_cases.
    APPEND `-354626406802|K971625:1,K416540:8|-39402934089,-315223472713` TO rt_cases.
    APPEND `5|K024842:0,K869302:322049,K828376:336990,K264060:436167,K909852:875697,K393974:447634,K935945:741285,K508768:`
        && `964094,K577440:463497,K342352:771573,K437518:776534,K298177:998792,K004646:0,K261571:174876|0,0,0,0,1,0,0,1,0,`
        && `1,1,1,0,0` TO rt_cases.
    APPEND `-11|K724643:3,K242071:0,K967591:3,K142856:0,K030796:3,K670433:1,K160422:0,K543301:9,K039520:10,K606523:6,K4278`
        && `28:7,K321527:3,K202522:12|-1,0,0,0,-1,0,0,-2,-2,-1,-1,-1,-2` TO rt_cases.
    APPEND `-16|K481404:2,K470689:0,K372978:0,K077852:2,K866505:10,K032481:9,K733644:6,K246232:7,K952073:9,K885023:10|0,0,`
        && `0,0,-3,-3,-2,-2,-3,-3` TO rt_cases.
    APPEND `-3|K243578:768607,K598806:33334,K192016:760678,K786447:72552,K876764:0,K372174:401738|-1,0,-1,0,0,-1` TO rt_cases.
    APPEND `-1|K295731:1,K163183:1,K416432:1,K629418:1|0,-1,0,0` TO rt_cases.
    APPEND `-69314548472|K957834:3,K526296:2,K804926:11,K623434:7|-9041028061,-6027352041,-33150436226,-21095732144` TO rt_cases.
    APPEND `20|K019933:0,K534154:95671,K151783:138908,K925378:0,K469666:220152,K427374:844252,K007160:0|0,2,2,0,3,13,0` TO rt_cases.
    APPEND `-4|K290220:5,K779113:6,K501426:5,K277815:4|-1,-1,-1,-1` TO rt_cases.
    APPEND `11|K153052:0,K341424:661745,K599592:0,K475972:661925|0,5,0,6` TO rt_cases.
    APPEND `-353220605435|K019320:1,K766172:0|-353220605435,0` TO rt_cases.
    APPEND `-8|K630255:229425,K195017:81401,K295499:606539,K633139:243294|-2,0,-4,-2` TO rt_cases.
    APPEND `-9|K399614:743036,K032287:627429,K802548:0,K480954:713422|-3,-3,0,-3` TO rt_cases.
    APPEND `-4|K575980:941655,K249728:29104,K055437:970731|-2,0,-2` TO rt_cases.
    APPEND `-16166029799|K353687:8,K190340:1,K045865:4,K149448:3,K589524:12,K287724:4,K278023:9,K589232:7,K813541:4,K14593`
        && `4:7,K113108:6,K981476:12,K650139:3,K472725:4|-1539621886,-192452736,-769810943,-577358207,-2309432828,-7698109`
        && `43,-1732074621,-1347169150,-769810943,-1347169150,-1154716414,-2309432828,-577358207,-769810943` TO rt_cases.
    APPEND `-3|K219888:4,K711660:2,K683222:6,K925431:2,K100019:7,K794469:2,K458248:8,K735137:10,K946202:12|0,0,0,0,0,0,-1,`
        && `-1,-1` TO rt_cases.
    APPEND `731755047248|K771550:4,K016037:8,K235868:11,K078316:9,K546545:1,K292654:10,K173772:2,K297469:8,K915406:4,K8421`
        && `68:1,K281428:6,K202001:10,K307063:3|38013249208,76026498415,104536435321,85529810717,9503312302,95033123019,19`
        && `006624604,76026498415,38013249208,9503312302,57019873812,95033123019,28509936906` TO rt_cases.
    APPEND `359461005026|K452464:1,K966457:1,K464702:1,K042755:1,K107646:1,K536724:1,K523705:1,K126098:1,K122903:1,K119121`
        && `:1,K805257:1|32678273184,32678273184,32678273184,32678273185,32678273185,32678273184,32678273184,32678273184,3`
        && `2678273184,32678273184,32678273184` TO rt_cases.
    APPEND `-16|K676221:6,K100590:12,K663473:5,K710969:12,K377104:0,K256296:1,K586518:0,K730283:1,K367099:1,K790556:7,K943`
        && `260:3|-2,-4,-2,-4,0,-1,0,0,0,-2,-1` TO rt_cases.
    APPEND `35|K251719:0,K170560:651408,K473619:515976,K163374:338939,K572416:141959,K074604:651393,K635702:0,K147603:0,K2`
        && `97728:121274,K620589:701677,K138516:725446,K235979:942766,K840349:717552|0,4,3,2,1,4,0,0,1,4,5,6,5` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_06.
    APPEND `13|K684323:49267,K015280:946561,K537724:968118,K605334:669553,K277042:0,K067210:0,K437496:215139,K941193:70424`
        && `7,K970878:858093|0,3,3,2,0,0,1,2,2` TO rt_cases.
    APPEND `9|K810901:12,K121824:2,K382758:5|6,1,2` TO rt_cases.
    APPEND `4|K814579:629690,K942650:412032,K597130:0|2,2,0` TO rt_cases.
    APPEND `-812379709272|K792690:1,K394048:1,K356547:1,K145751:1,K356447:1,K529313:1,K778298:1,K120889:1,K298547:1,K48832`
        && `4:1|-81237970927,-81237970927,-81237970927,-81237970928,-81237970927,-81237970927,-81237970927,-81237970928,-8`
        && `1237970927,-81237970927` TO rt_cases.
    APPEND `6|K126896:1,K980775:1|3,3` TO rt_cases.
    APPEND `648385695638|K694211:1,K638440:2|216128565213,432257130425` TO rt_cases.
    APPEND `12|K888705:0,K266865:1,K689051:2,K594001:4,K545153:8,K918924:11,K728325:4,K276779:6,K367429:6,K572621:12|0,0,1`
        && `,1,2,2,1,1,1,3` TO rt_cases.
    APPEND `-20|K417137:423777,K991522:882689,K903756:0,K334653:64275,K723798:0,K720414:119529,K982046:873683,K711632:7378`
        && `44,K964918:969976,K697663:189185,K113554:103443|-2,-4,0,0,0,-1,-4,-3,-4,-1,-1` TO rt_cases.
    APPEND `17|K551928:657454,K622369:445641,K480138:417741,K212093:151659,K510105:141569,K098885:630976,K519861:146671|4,`
        && `3,3,1,1,4,1` TO rt_cases.
    APPEND `1|K290605:1|1` TO rt_cases.
    APPEND `-17|K726257:843439,K439959:914711,K030824:735879,K747771:619269,K340447:0,K589769:388084|-4,-4,-4,-3,0,-2` TO rt_cases.
    APPEND `788631553078|K420863:1,K508588:1,K073118:1,K803886:1,K004694:1,K429147:1,K279943:1,K186203:1,K451239:1,K563883`
        && `:1,K656490:1,K407421:1|65719296090,65719296090,65719296090,65719296089,65719296090,65719296090,65719296090,657`
        && `19296090,65719296090,65719296090,65719296089,65719296090` TO rt_cases.
    APPEND `819400889423|K294135:11,K043249:5,K819488:0,K599433:7,K718710:12,K282213:2|243605669828,110729849922,0,1550217`
        && `89891,265751639813,44291939969` TO rt_cases.
    APPEND `705406752359|K683735:1|705406752359` TO rt_cases.
    APPEND `6|K728401:1,K397324:1,K583251:1,K505253:1,K791953:1,K687633:1,K716455:1,K095795:1,K114295:1,K146641:1,K949034:`
        && `1|0,1,1,1,0,0,0,1,1,1,0` TO rt_cases.
    APPEND `-5|K850242:1,K538249:1,K064596:1,K240373:1|-1,-1,-2,-1` TO rt_cases.
    APPEND `-6|K834933:10,K057592:5,K120148:0,K192876:11,K422464:1,K851531:1,K779658:11,K294916:6,K261748:2|-1,-1,0,-2,0,0`
        && `,-1,-1,0` TO rt_cases.
    APPEND `262906992928|K087083:5,K717135:3,K720109:6,K885027:11,K380713:8,K794721:7,K006398:5,K844205:8,K881535:0,K39523`
        && `0:2,K089621:11,K101574:12,K240900:11,K951233:9|13413622088,8048173253,16096346506,29509968594,21461795341,1877`
        && `9070923,13413622088,21461795341,0,5365448835,29509968594,32192693012,29509968594,24144519759` TO rt_cases.
    APPEND `1|K254220:120178,K339928:631860,K714615:800324,K787020:126915|0,0,1,0` TO rt_cases.
    APPEND `866093159032|K374680:0,K780491:1,K378943:3,K144226:12,K709953:4,K331936:6,K550274:11,K892650:4,K004678:11,K426`
        && `536:7,K605241:6,K438879:5,K206474:1,K505924:11|0,10562111695,31686335086,126745340346,42248446782,63372670173,`
        && `116183228651,42248446782,116183228651,73934781869,63372670173,52810558478,10562111695,116183228651` TO rt_cases.
    APPEND `6|K633814:7,K194763:4,K975342:11,K910014:3,K033543:6,K697060:5,K817958:7|1,1,1,0,1,1,1` TO rt_cases.
    APPEND `12|K035631:1,K861872:1,K843677:1,K958488:1|3,3,3,3` TO rt_cases.
    APPEND `10|K742191:1,K419525:1,K840311:1,K806054:1,K775121:1,K358684:1,K544215:1,K575258:1,K802494:1|1,1,1,1,1,2,1,1,1` TO rt_cases.
    APPEND `-727326528468|K281172:6,K253487:12,K339602:5,K262455:4,K644556:9,K526244:11,K032096:10,K861082:5,K218561:2,K15`
        && `5848:5|-63245785084,-126491570168,-52704820904,-42163856723,-94868677626,-115950605988,-105409641807,-52704820`
        && `903,-21081928361,-52704820904` TO rt_cases.
    APPEND `-982776430998|K926694:1,K039709:1,K861779:1,K314992:1,K816874:1,K457699:1,K540530:1,K724347:1,K570675:1,K40152`
        && `1:1|-98277643099,-98277643100,-98277643099,-98277643100,-98277643100,-98277643100,-98277643100,-98277643100,-9`
        && `8277643100,-98277643100` TO rt_cases.
    APPEND `-2|K741777:6|-2` TO rt_cases.
    APPEND `34|K484543:500217,K913728:188689,K239195:728376,K175820:620236,K507635:441432,K378759:674818,K322439:320722,K9`
        && `14824:215320,K427567:819601,K088171:54026,K479534:795438,K144950:781765|3,1,4,3,3,4,2,1,5,0,4,4` TO rt_cases.
    APPEND `46626549161|K318414:3,K597260:10,K835086:6,K193301:3,K112631:12,K091834:3,K829583:8,K432015:8,K587410:3,K22548`
        && `9:12,K997555:1,K989911:0|2027241268,6757470893,4054482536,2027241268,8108965072,2027241268,5405976714,54059767`
        && `14,2027241268,8108965071,675747089,0` TO rt_cases.
    APPEND `-770808250406|K586730:4,K643912:3,K466898:1,K381095:10,K393306:4,K937070:3,K138304:10|-88092371475,-6606927860`
        && `6,-22023092869,-220230928687,-88092371475,-66069278606,-220230928688` TO rt_cases.
    APPEND `-15|K044801:0,K851861:103287,K254559:489693,K831327:677471,K911476:979461,K466596:653417,K357528:0,K898283:322`
        && `240,K313839:737733,K793805:330969|0,0,-2,-2,-4,-2,0,-1,-3,-1` TO rt_cases.
    APPEND `-40|K069650:1,K846766:1,K214380:1,K116263:1,K520722:1,K826840:1,K930635:1,K849081:1,K144476:1,K630367:1,K87280`
        && `7:1,K609928:1,K188380:1,K855539:1|-3,-3,-3,-3,-3,-3,-2,-3,-3,-3,-2,-3,-3,-3` TO rt_cases.
    APPEND `-5|K176065:1,K553836:1,K785240:1,K079429:1,K854427:1|-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `-60557156009|K329490:1,K021159:1,K874865:1,K880477:1,K700871:1,K381609:1,K686631:1,K011925:1,K206600:1,K382547`
        && `:1,K724667:1,K731407:1,K363574:1|-4658242770,-4658242770,-4658242770,-4658242769,-4658242770,-4658242770,-4658`
        && `242770,-4658242770,-4658242770,-4658242770,-4658242770,-4658242770,-4658242770` TO rt_cases.
    APPEND `-9|K154121:42767,K209037:228727,K724875:406167,K096961:957231,K377656:0,K093040:97055|0,-1,-2,-5,0,-1` TO rt_cases.
    APPEND `1|K716264:1|1` TO rt_cases.
    APPEND `-687810735429|K668209:7,K034121:11,K405769:12|-160489171600,-252197269657,-275124294172` TO rt_cases.
    APPEND `20|K397217:550271,K591083:657840,K051018:640701,K896640:0,K041658:176757,K929301:739026,K298672:757442,K026591`
        && `:365700,K956867:210867,K980345:0,K132253:290754,K828295:995527,K612055:0,K903632:919759|2,2,2,0,1,2,2,1,1,0,1,`
        && `3,0,3` TO rt_cases.
    APPEND `467991456435|K078174:4,K540896:11,K456828:4,K057171:2|89141229797,245138381942,89141229797,44570614899` TO rt_cases.
    APPEND `-932563251292|K496854:7|-932563251292` TO rt_cases.
    APPEND `-5|K157701:187713,K539324:70755,K633784:479181,K385340:0,K654947:811826,K417106:0|-1,0,-1,0,-3,0` TO rt_cases.
    APPEND `9|K364251:66431,K540060:379697,K265776:0|1,8,0` TO rt_cases.
    APPEND `-4|K767962:589660,K433425:0,K528539:167589,K087456:224544,K660825:0,K191094:233359|-2,0,0,-1,0,-1` TO rt_cases.
    APPEND `802851407019|K310479:1,K103188:1,K562941:1,K033965:1,K457542:1,K443253:1,K096069:1|114693058146,114693058146,1`
        && `14693058145,114693058146,114693058145,114693058145,114693058146` TO rt_cases.
    APPEND `-8|K141074:7,K888442:2,K082293:2|-5,-1,-2` TO rt_cases.
    APPEND `8|K904055:1,K949466:1,K798978:1,K469764:1,K886722:1,K589802:1|1,1,1,2,1,2` TO rt_cases.
    APPEND `215372453323|K271047:2,K564784:8,K286432:0,K896112:2,K920686:9,K892216:7,K041084:1,K005551:10,K524641:3,K27416`
        && `7:9,K723716:0,K819970:2|8127262390,32509049558,0,8127262389,36572680753,28445418363,4063631195,40636311948,121`
        && `90893584,36572680753,0,8127262390` TO rt_cases.
    APPEND `29|K084703:249189,K056569:374561,K020273:239055,K725274:505146,K311750:221023,K384874:504872,K273274:141080,K6`
        && `78206:0,K249931:240216,K663281:705205,K875941:71574|2,3,2,5,2,5,1,0,2,6,1` TO rt_cases.
    APPEND `-992167575786|K697627:1,K715990:1,K245274:1,K846607:1,K282329:1,K105222:1,K843483:1,K285103:1,K801970:1,K93515`
        && `7:1|-99216757579,-99216757579,-99216757579,-99216757578,-99216757579,-99216757579,-99216757578,-99216757579,-9`
        && `9216757578,-99216757578` TO rt_cases.
    APPEND `-2|K434227:1|-2` TO rt_cases.
    APPEND `287702063285|K598203:1,K503940:1,K874445:1,K375153:1,K451717:1,K298113:1,K700703:1,K823181:1|35962757911,35962`
        && `757911,35962757910,35962757911,35962757911,35962757911,35962757910,35962757910` TO rt_cases.
    APPEND `783632738660|K034334:7,K561713:10,K392920:5,K890726:0,K927439:0,K736547:1,K259790:5,K402989:7|156726547732,223`
        && `895068189,111947534094,0,0,22389506819,111947534094,156726547732` TO rt_cases.
    APPEND `884269762289|K438787:1,K078952:1,K413239:1,K254166:1|221067440572,221067440573,221067440572,221067440572` TO rt_cases.
    APPEND `9|K572831:1,K021941:1,K713215:1|3,3,3` TO rt_cases.
    APPEND `0|K273518:853662,K299471:719961|0,0` TO rt_cases.
    APPEND `-871515774712|K462094:1,K795545:1,K100720:1,K262245:1,K069278:1,K059696:1,K444752:1,K267795:1,K746571:1,K88395`
        && `2:1,K135810:1,K786164:1,K502816:1,K688455:1|-62251126765,-62251126765,-62251126765,-62251126765,-62251126766,-`
        && `62251126766,-62251126765,-62251126765,-62251126765,-62251126765,-62251126765,-62251126765,-62251126765,-622511`
        && `26765` TO rt_cases.
    APPEND `370448098829|K937831:3,K963160:8,K346340:3,K084297:0|79381735463,211684627902,79381735464,0` TO rt_cases.
    APPEND `-11|K577495:1,K014582:1,K777452:1,K224165:1,K408939:1|-2,-3,-2,-2,-2` TO rt_cases.
    APPEND `8|K691810:656758,K020342:0,K128433:383251|5,0,3` TO rt_cases.
    APPEND `1|K560953:1|1` TO rt_cases.
    APPEND `713885148641|K148207:5,K228330:3,K563958:2,K868241:8,K120251:0|198301430178,118980858107,79320572071,317282288`
        && `285,0` TO rt_cases.
    APPEND `-143068039841|K647931:3,K445014:10,K993993:7,K953488:0,K030735:8,K966399:9,K036208:11|-8941752490,-29805841634`
        && `,-20864089143,0,-23844673307,-26825257470,-32786425797` TO rt_cases.
    APPEND `480279088695|K805174:1,K983259:1|240139544348,240139544347` TO rt_cases.
    APPEND `209752324782|K723815:1,K494366:1,K518111:1,K292959:1,K430153:1,K890888:1,K579384:1,K234214:1,K151327:1,K982652`
        && `:1,K303610:1|19068393162,19068393162,19068393162,19068393162,19068393162,19068393162,19068393162,19068393162,1`
        && `9068393162,19068393162,19068393162` TO rt_cases.
    APPEND `0|K739661:1|0` TO rt_cases.
    APPEND `20|K084928:505146,K812214:922468,K071757:297263,K365986:671242,K338999:949979,K299628:0,K790110:0,K440560:2781`
        && `4,K834526:452522,K924653:482492,K189412:999118,K012796:566333|2,3,1,2,3,0,0,0,2,2,3,2` TO rt_cases.
    APPEND `-104636851106|K689782:12,K345414:0,K082164:4,K030315:10,K478704:5,K181077:11,K175900:11|-23691362515,0,-789712`
        && `0838,-19742802095,-9871401048,-21717082305,-21717082305` TO rt_cases.
    APPEND `255795165723|K430298:2,K213544:5,K084796:11,K516724:7,K518504:7,K582792:6,K395893:9,K862886:2,K840816:7,K98606`
        && `2:9,K681446:8|7008086732,17520216830,38544477027,24528303563,24528303562,21024260196,31536390295,7008086732,24`
        && `528303562,31536390295,28032346929` TO rt_cases.
    APPEND `-1|K098566:648214|-1` TO rt_cases.
    APPEND `3|K741235:1|3` TO rt_cases.
    APPEND `8|K541663:0,K396131:0,K695120:328414,K655470:329805,K458762:225577,K432576:949809,K736214:935345,K867948:15826`
        && `0,K261347:96346|0,0,1,1,1,3,2,0,0` TO rt_cases.
    APPEND `19|K694647:698143,K965373:213437,K646528:0,K770461:0,K722048:367262,K399510:498562,K970070:144345,K813719:6602`
        && `43,K790928:698217,K552179:408487,K099519:99276,K097156:710622,K426906:0,K722350:566823|3,1,0,0,1,2,1,2,3,1,0,3`
        && `,0,2` TO rt_cases.
    APPEND `-4|K888575:912355,K539921:0,K756481:223001,K732262:165501,K516947:214828,K796051:628197,K562476:0,K673466:4344`
        && `79|-2,0,0,0,0,-1,0,-1` TO rt_cases.
    APPEND `-12|K799979:462820,K971419:47907,K711435:662414,K028787:0,K000069:686883,K947405:815733,K659132:262055,K149722`
        && `:625692,K379046:252078,K449631:666379,K304595:976005|-1,0,-1,0,-2,-2,-1,-1,-1,-1,-2` TO rt_cases.
    APPEND `-455416177790|K162485:1,K804312:1,K273813:1,K124446:1|-113854044448,-113854044447,-113854044447,-113854044448` TO rt_cases.
    APPEND `10|K191324:4,K578891:8,K890964:7,K524781:5,K045108:0|2,3,3,2,0` TO rt_cases.
    APPEND `149909277370|K590609:8|149909277370` TO rt_cases.
    APPEND `375682109143|K337681:1,K258387:1,K077397:1|125227369714,125227369714,125227369715` TO rt_cases.
    APPEND `783711285025|K744091:1,K450463:1,K189947:1,K997275:1,K864298:1,K551008:1|130618547504,130618547504,13061854750`
        && `5,130618547504,130618547504,130618547504` TO rt_cases.
    APPEND `32|K643180:6,K323802:9,K554375:0,K959521:10,K380823:6,K723299:6,K010188:8,K572190:1,K886852:1,K161561:6,K70327`
        && `9:0|4,5,0,6,4,4,5,0,0,4,0` TO rt_cases.
    APPEND `633098566616|K537855:1,K797465:1,K304180:1,K091725:1,K663784:1,K827310:1,K865537:1,K392767:1|79137320827,79137`
        && `320827,79137320827,79137320827,79137320827,79137320827,79137320827,79137320827` TO rt_cases.
    APPEND `-3|K018058:724294,K289406:701981,K740180:386350,K401783:0,K290682:891374,K712790:698055,K972707:736426,K816443`
        && `:304845|-1,0,0,0,-1,0,-1,0` TO rt_cases.
    APPEND `3|K988911:1|3` TO rt_cases.
    APPEND `-6|K762898:440832,K907919:0,K220938:0,K031189:746743,K860676:137007|-2,0,0,-3,-1` TO rt_cases.
    APPEND `355001559214|K192742:1,K517219:1,K962665:1|118333853072,118333853071,118333853071` TO rt_cases.
    APPEND `-30|K322874:45948,K766578:461471,K602995:18564,K163613:105627,K481511:855989,K570694:781112,K182544:794734,K77`
        && `7663:0,K924270:5580,K440463:57835,K269982:951008|0,-3,0,-1,-6,-6,-6,0,0,-1,-7` TO rt_cases.
    APPEND `-9|K197394:546933,K028172:951483,K550303:0,K559570:541781,K712824:0,K862428:366064,K489380:975793,K276629:9364`
        && `32,K372132:807391,K976109:528531,K275224:231928,K888327:693297,K946394:0,K604846:561559|-1,-1,0,-1,0,0,-1,-1,-`
        && `1,-1,0,-1,0,-1` TO rt_cases.
    APPEND `19|K548858:257258,K729490:223717,K942670:652836,K314076:0,K175743:757292,K709236:241360,K308122:908729,K068704`
        && `:887145|1,1,3,0,4,1,5,4` TO rt_cases.
    APPEND `-27|K270846:1,K493229:1,K215258:1,K267350:1,K246526:1,K141074:1,K556462:1,K626294:1,K861280:1,K050490:1|-3,-3,`
        && `-3,-3,-3,-3,-2,-2,-2,-3` TO rt_cases.
    APPEND `15|K406635:10,K255848:10,K124614:12,K273104:12,K608435:3,K460574:1,K175909:3,K447358:1,K688658:5,K075466:2,K53`
        && `1089:7,K275419:5,K364550:3,K461492:11|2,2,2,2,0,0,1,0,1,0,1,1,1,2` TO rt_cases.
    APPEND `7|K948022:614912,K735786:0,K329916:510269|4,0,3` TO rt_cases.
    APPEND `4|K980266:1,K600859:1,K053963:1,K665690:1,K193702:1,K857032:1|0,1,1,1,1,0` TO rt_cases.
    APPEND `612938181409|K824478:1,K209841:1,K273880:1,K228384:1,K544421:1,K215713:1,K752462:1,K450671:1,K013512:1,K842648`
        && `:1,K076146:1,K042522:1,K491292:1|47149090877,47149090878,47149090878,47149090878,47149090877,47149090878,47149`
        && `090877,47149090878,47149090878,47149090877,47149090878,47149090878,47149090877` TO rt_cases.
    APPEND `630356302540|K193727:1,K264395:1,K700154:1,K245210:1,K426279:1,K176380:1,K313380:1,K748319:1,K204387:1,K432228`
        && `:1,K117810:1,K675949:1|52529691879,52529691878,52529691878,52529691878,52529691878,52529691879,52529691878,525`
        && `29691878,52529691879,52529691878,52529691879,52529691878` TO rt_cases.
    APPEND `-110449893579|K570993:1,K236126:1,K101176:1|-36816631193,-36816631193,-36816631193` TO rt_cases.
    APPEND `490345301843|K230955:4,K498559:3,K212988:5,K186329:3,K284687:1|122586325461,91939744095,153232906826,919397440`
        && `96,30646581365` TO rt_cases.
    APPEND `10|K837177:235171,K775031:337076,K730350:126910,K023608:0|3,5,2,0` TO rt_cases.
    APPEND `649316134010|K111107:6,K902122:9,K742343:8,K966162:12,K345805:4,K309210:6,K011149:1,K953564:2,K332060:5,K03111`
        && `0:9,K248275:3,K269700:7,K494497:0,K636415:7|49315149418,73972724128,65753532558,98630298837,32876766279,493151`
        && `49418,8219191570,16438383140,41095957849,73972724128,24657574709,57534340988,0,57534340988` TO rt_cases.
    APPEND `1|K408590:1,K712585:1|1,0` TO rt_cases.
    APPEND `-906974896601|K714058:1,K383992:1|-453487448300,-453487448301` TO rt_cases.
    APPEND `4|K784265:0,K160299:778930|0,4` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_07.
    APPEND `-3|K121285:7,K237426:11,K230012:7,K645963:0,K406308:9,K918824:8,K039531:6,K989722:10,K565004:1,K782432:10|0,-1`
        && `,0,0,0,0,0,-1,0,-1` TO rt_cases.
    APPEND `-314369440432|K035504:0,K268048:9,K376111:1,K308787:2,K407231:4,K619599:0,K331154:7,K341436:2,K161406:11,K8564`
        && `28:7,K236573:5,K842760:4,K469012:2|0,-52394906739,-5821656304,-11643312609,-23286625217,0,-40751594130,-116433`
        && `12609,-64038219347,-40751594130,-29108281521,-23286625217,-11643312609` TO rt_cases.
    APPEND `-13|K207343:3,K120132:12,K388908:8,K411571:6,K066044:12,K838651:5,K885647:8|-1,-3,-2,-1,-3,-1,-2` TO rt_cases.
    APPEND `-16|K050971:824794,K216779:813391,K470346:253886,K373009:596627,K162356:775941,K524642:861928,K754876:160190|-`
        && `3,-3,-1,-2,-3,-3,-1` TO rt_cases.
    APPEND `-2|K526955:1,K375557:1,K030194:1,K072174:1,K460982:1,K131986:1,K690206:1,K719913:1,K427622:1,K776299:1,K082592`
        && `:1|0,0,-1,-1,0,0,0,0,0,0,0` TO rt_cases.
    APPEND `-789090381493|K890323:12,K244444:6,K085492:6,K189805:12,K858088:6,K365291:0,K440774:5,K264769:9,K689104:11,K06`
        && `4611:12|-119861830100,-59930915050,-59930915050,-119861830100,-59930915050,0,-49942429209,-89896372575,-109873`
        && `344259,-119861830100` TO rt_cases.
    APPEND `-3|K220507:1,K332752:1,K946990:1,K600870:1,K281591:1,K231260:1,K895253:1|-1,0,0,0,-1,-1,0` TO rt_cases.
    APPEND `6|K497808:393923,K768861:944670,K201794:0,K448167:186935,K819931:997257|1,2,0,1,2` TO rt_cases.
    APPEND `-930024566723|K661325:1,K693587:8|-103336062969,-826688503754` TO rt_cases.
    APPEND `35|K994909:1,K007083:1,K282874:6,K649576:2,K131058:12,K236678:11,K562053:7,K439672:10,K403491:9,K758496:10,K51`
        && `7676:0,K108918:3,K549047:7,K657953:3|0,1,3,1,5,5,3,4,4,4,0,1,3,1` TO rt_cases.
    APPEND `5|K861891:1,K938471:1,K184336:1,K216784:1,K255852:1,K373321:1|1,0,1,1,1,1` TO rt_cases.
    APPEND `-894419692924|K303545:1,K513892:1,K489247:1,K547458:1,K624470:1,K625675:1,K416667:1|-127774241847,-12777424184`
        && `6,-127774241846,-127774241846,-127774241846,-127774241846,-127774241847` TO rt_cases.
    APPEND `-13|K655498:1,K248955:1,K874860:1,K608453:1,K836138:1,K244034:1,K026686:1,K743533:1,K044825:1|-1,-2,-1,-1,-1,-`
        && `2,-2,-1,-2` TO rt_cases.
    APPEND `1|K824348:1,K151325:1|0,1` TO rt_cases.
    APPEND `-861971889566|K329288:1,K768160:1,K427461:1,K431623:1,K666275:1,K294612:1|-143661981595,-143661981594,-1436619`
        && `81594,-143661981594,-143661981594,-143661981595` TO rt_cases.
    APPEND `-42|K884402:11,K973256:0,K001463:1,K353303:5,K776475:9,K286488:3,K916573:9,K561917:3,K719775:2,K300290:7,K7973`
        && `82:8,K442507:7,K340144:3,K602421:3|-6,0,-1,-3,-5,-2,-5,-2,-1,-4,-5,-4,-2,-2` TO rt_cases.
    APPEND `0|K168819:1|0` TO rt_cases.
    APPEND `1|K142740:1|1` TO rt_cases.
    APPEND `-21|K628147:365455,K215933:831073,K794411:620171,K885829:0,K347422:293589,K977107:0,K953657:0,K870189:0|-4,-8,`
        && `-6,0,-3,0,0,0` TO rt_cases.
    APPEND `-440292776691|K064096:9,K242634:5,K618288:1,K195972:4,K799020:7,K270962:6,K471621:5|-107098242979,-59499023877`
        && `,-11899804775,-47599219102,-83298633428,-71398828653,-59499023877` TO rt_cases.
    APPEND `-14|K083146:351851,K731380:579827,K308002:213478,K449787:163244,K495465:901879,K860377:438928,K068186:88510|-2`
        && `,-3,-1,-1,-5,-2,0` TO rt_cases.
    APPEND `-177047077714|K732767:1,K557734:1|-88523538857,-88523538857` TO rt_cases.
    APPEND `37244607077|K958237:1|37244607077` TO rt_cases.
    APPEND `2|K630760:881391,K129110:366556,K494368:0,K297260:252853,K253149:836435,K548204:0,K198177:603046|1,0,0,0,1,0,0` TO rt_cases.
    APPEND `-705713069065|K857476:7,K700012:1,K916581:9,K671196:12,K088300:0,K273264:8|-133513283337,-19073326191,-1716599`
        && `35718,-228879914291,0,-152586609528` TO rt_cases.
    APPEND `-4|K796412:1,K272488:1|-2,-2` TO rt_cases.
    APPEND `-13|K363978:5,K360300:6,K541369:8,K039296:9,K851472:10|-2,-2,-3,-3,-3` TO rt_cases.
    APPEND `-1|K558354:466546|-1` TO rt_cases.
    APPEND `33|K289418:0,K063665:509305,K579579:0,K369385:465162,K929067:234221,K512073:67113,K923027:410980,K198904:21812`
        && `3,K688060:238641,K181541:185298,K808981:486910,K933369:652277|0,5,0,4,2,1,4,2,2,2,5,6` TO rt_cases.
    APPEND `-883369654096|K151137:5,K957647:1,K233675:2,K600261:11,K157542:11,K199264:8|-116232849223,-23246569845,-464931`
        && `39689,-255712268291,-255712268291,-185972558757` TO rt_cases.
    APPEND `92524049863|K980451:12,K000963:8,K634808:6,K183878:3,K984923:9,K063156:11,K892578:4,K700383:2,K100054:7,K06718`
        && `5:9,K667204:1,K403637:11,K103415:7,K188576:2|12068354330,8045569553,6034177165,3017088583,9051265747,110626581`
        && `36,4022784777,2011392388,7039873359,9051265748,1005696194,11062658136,7039873359,2011392388` TO rt_cases.
    APPEND `28|K065743:475159,K849169:292737,K630581:103647,K950016:362673,K211943:412920,K569886:697869,K854576:29523,K68`
        && `0389:14821,K797861:0,K378492:0|6,4,1,4,5,8,0,0,0,0` TO rt_cases.
    APPEND `-844540427318|K814506:1,K340703:1,K088829:1,K617595:1,K495374:1,K126565:1,K717396:1,K688343:1|-105567553414,-1`
        && `05567553415,-105567553415,-105567553415,-105567553415,-105567553415,-105567553414,-105567553415` TO rt_cases.
    APPEND `354924618670|K860150:1,K487745:1,K743199:1,K932799:1,K955526:1,K129609:1,K663258:1,K434061:1,K620882:1,K611225`
        && `:1,K840827:1,K277968:1,K509417:1|27301893744,27301893744,27301893744,27301893743,27301893743,27301893744,27301`
        && `893744,27301893744,27301893744,27301893744,27301893744,27301893744,27301893744` TO rt_cases.
    APPEND `-37|K869539:0,K137230:648346,K274485:0,K384395:935765,K536719:115232,K466529:0,K374895:165072,K096594:918020,K`
        && `079823:108071,K352888:193208,K994197:232504,K683348:0,K438203:62050|0,-7,0,-10,-1,0,-2,-10,-1,-2,-3,0,-1` TO rt_cases.
    APPEND `422055240711|K260897:0,K143820:4,K081976:8,K461500:3,K484416:3,K223007:8,K977946:6,K207867:9|0,41176121045,823`
        && `52242090,30882090784,30882090784,82352242090,61764181567,92646272351` TO rt_cases.
    APPEND `-9|K135755:1,K308731:1,K996981:1,K088064:1,K744280:1,K824018:1,K825892:1,K683951:1|-1,-1,-1,-2,-1,-1,-1,-1` TO rt_cases.
    APPEND `32|K030545:226052,K439688:0,K475962:852925,K567207:93185,K522152:0,K074584:419603,K620759:427570,K597053:0,K17`
        && `7574:886160,K622653:804572,K205769:261551,K198648:187708,K952027:836573|1,0,5,1,0,3,3,0,6,5,2,1,5` TO rt_cases.
    APPEND `-402495532844|K015951:1|-402495532844` TO rt_cases.
    APPEND `-12|K465213:1,K418423:1,K691182:1,K362096:1,K476945:1,K731048:1,K430986:1,K485231:1,K351966:1,K478759:1|-1,-1,`
        && `-1,-2,-1,-1,-1,-1,-2,-1` TO rt_cases.
    APPEND `16|K986531:6,K849342:8,K069853:7,K705092:12,K502991:9,K860703:1,K294816:11,K191837:8|2,2,2,3,2,0,3,2` TO rt_cases.
    APPEND `-4|K842464:0,K803770:500486,K979324:0|0,-4,0` TO rt_cases.
    APPEND `-2|K875814:1,K830361:1,K142766:1,K968905:1,K636865:1,K362244:1,K955600:1,K433943:1|0,0,-1,0,0,-1,0,0` TO rt_cases.
    APPEND `-12|K950370:1,K232701:1,K619746:1,K213312:1,K349563:1,K791392:1,K852625:1,K120825:1,K287292:1|-1,-2,-1,-2,-1,-`
        && `1,-1,-2,-1` TO rt_cases.
    APPEND `965070534945|K538716:1,K834540:1|482535267473,482535267472` TO rt_cases.
    APPEND `-212192137155|K949352:9,K727701:1,K509956:6,K622903:9,K717766:11,K153577:9,K866863:3,K578478:0,K730372:5,K9415`
        && `53:12,K659480:9,K477732:11|-22467402757,-2496378084,-14978268505,-22467402758,-27460158926,-22467402758,-74891`
        && `34252,0,-12481890421,-29956537010,-22467402758,-27460158926` TO rt_cases.
    APPEND `-18|K892984:417115,K569575:538815,K107047:976237,K965662:84598,K888373:70149,K020962:571075,K892130:284651,K16`
        && `7832:765881,K842692:578951|-2,-2,-4,0,0,-3,-1,-3,-3` TO rt_cases.
    APPEND `-642929464197|K414952:4,K801464:3,K285947:9,K540208:11,K717191:10,K922915:9,K288054:5,K248412:4,K057829:9,K090`
        && `338:0,K231024:2,K182116:2|-37819380247,-28364535185,-85093605556,-104003295679,-94548450617,-85093605555,-4727`
        && `4225309,-37819380247,-85093605556,0,-18909690123,-18909690123` TO rt_cases.
    APPEND `-24|K527243:796480,K240642:0,K267525:158916,K487160:331810,K059410:65377,K531866:0,K677165:0,K817982:474922,K4`
        && `39246:985375,K686778:0,K621198:892707,K410170:158779,K207425:695704,K258182:265205|-4,0,-1,-2,0,0,0,-2,-5,0,-4`
        && `,-1,-4,-1` TO rt_cases.
    APPEND `-22|K083454:3,K441402:9,K931633:2,K940693:3,K960088:4,K139466:9,K405419:1,K259540:2,K676541:6,K642033:1,K89764`
        && `4:12|-1,-4,-1,-1,-2,-4,0,-1,-3,0,-5` TO rt_cases.
    APPEND `29|K844681:0,K523329:708286,K087835:648339,K722734:0,K475445:992191,K988457:592760,K926027:0,K786558:331757,K5`
        && `27321:64483,K474688:854181,K665105:973726,K346619:950663,K838119:517729,K503629:157466|0,3,3,0,4,3,0,1,0,4,4,4`
        && `,2,1` TO rt_cases.
    APPEND `-2|K963174:854827,K572885:735505,K935357:658213,K581222:128657,K356570:161206,K057468:0,K836632:765184,K832688`
        && `:911161,K674169:0,K532069:0,K417950:0,K614056:0,K199525:386039|-1,0,0,0,0,0,0,-1,0,0,0,0,0` TO rt_cases.
    APPEND `27|K068472:11,K968637:7,K334030:1,K749311:11,K268465:8,K515950:6,K853363:12,K378083:4,K190032:5|5,3,0,5,3,2,5,`
        && `2,2` TO rt_cases.
    APPEND `794608001687|K150333:1,K050846:1,K064437:1,K942213:1,K225158:1,K345150:1,K060341:1|113515428812,113515428813,1`
        && `13515428813,113515428812,113515428812,113515428812,113515428813` TO rt_cases.
    APPEND `7|K061657:229080,K670300:0,K118060:0|7,0,0` TO rt_cases.
    APPEND `4|K378797:1,K738630:1,K638394:1,K759307:1,K762379:1,K758760:1,K620175:1,K943175:1,K014010:1,K961669:1,K018041:`
        && `1|1,0,0,0,0,0,1,0,1,0,1` TO rt_cases.
    APPEND `23572136095|K989235:1,K717427:1,K911372:1,K974054:1,K364199:1,K348587:1,K167194:1,K685150:1,K388971:1,K519996:`
        && `1,K369877:1,K510436:1,K047582:1|1813241238,1813241238,1813241238,1813241238,1813241238,1813241238,1813241238,1`
        && `813241238,1813241238,1813241238,1813241238,1813241238,1813241239` TO rt_cases.
    APPEND `-20|K483699:11,K040571:0,K083171:5,K681178:12,K694061:12,K652497:4,K412135:7,K639746:2|-4,0,-2,-5,-4,-1,-3,-1` TO rt_cases.
    APPEND `-7|K215722:350338,K908248:818896,K247829:0,K171865:0|-2,-5,0,0` TO rt_cases.
    APPEND `-10|K826677:468738,K619866:237819,K953657:472726,K235007:0,K080196:104084,K560966:83833,K299578:744367,K808606`
        && `:0,K425514:905846|-2,-1,-2,0,0,0,-2,0,-3` TO rt_cases.
    APPEND `-635122987596|K573761:6,K925239:0,K117657:3,K774792:5,K862991:12,K080430:2,K378746:5,K082547:12,K360178:5,K765`
        && `649:9,K925128:1,K897636:4|-59542780087,0,-29771390044,-49618983406,-119085560174,-19847593362,-49618983406,-11`
        && `9085560174,-49618983406,-89314170131,-9923796681,-39695186725` TO rt_cases.
    APPEND `-2|K933490:756090,K426509:0,K927398:191004|-2,0,0` TO rt_cases.
    APPEND `11|K719506:6627,K851872:442519,K020600:858350,K607189:548034,K123844:94716,K899607:625481,K316488:0,K589228:25`
        && `4539,K775997:259229,K893228:0,K263148:903097,K718009:895307,K754701:590287,K522736:0|0,1,2,1,0,1,0,0,1,0,2,2,1`
        && `,0` TO rt_cases.
    APPEND `-21|K454572:9,K729327:0,K559762:3,K909776:8,K849500:3,K384531:4,K840680:11,K334529:7,K875287:1,K877473:12,K207`
        && `131:1|-3,0,-1,-3,-1,-2,-4,-3,0,-4,0` TO rt_cases.
    APPEND `6|K421187:2,K355066:8|1,5` TO rt_cases.
    APPEND `-18|K891794:279207,K899560:0,K175359:730281,K939716:122212,K534308:391550,K106719:785373,K465724:884608,K36919`
        && `4:429832|-1,0,-4,-1,-2,-4,-4,-2` TO rt_cases.
    APPEND `-11|K945305:0,K859461:179702,K908822:918469,K625044:0|0,-2,-9,0` TO rt_cases.
    APPEND `4|K750736:29821,K432228:433587|0,4` TO rt_cases.
    APPEND `898965205449|K058660:1,K741925:1,K724186:1,K529113:1,K294714:1,K008996:1,K247252:1,K593572:1,K216359:1,K097262`
        && `:1,K587957:1,K444234:1|74913767121,74913767120,74913767120,74913767121,74913767121,74913767121,74913767121,749`
        && `13767120,74913767121,74913767121,74913767121,74913767121` TO rt_cases.
    APPEND `0|K056199:4,K275744:10|0,0` TO rt_cases.
    APPEND `34|K972884:8,K021189:7,K896635:5,K370036:1,K614824:5,K495575:7,K866621:11,K131582:8,K030761:3,K797965:10,K7088`
        && `23:0,K932633:9|4,3,2,1,2,3,5,4,1,5,0,4` TO rt_cases.
    APPEND `1|K011772:1,K947887:1,K221164:1,K330716:1|1,0,0,0` TO rt_cases.
    APPEND `1|K789850:0,K853348:0,K176583:805642,K414897:282763,K084939:485219,K713876:0,K906921:285950,K539635:974557,K91`
        && `4006:184538|0,0,0,0,0,0,0,1,0` TO rt_cases.
    APPEND `-452307929094|K134430:1,K121227:1,K153652:1,K042573:1|-113076982273,-113076982274,-113076982273,-113076982274` TO rt_cases.
    APPEND `24|K668875:1,K842349:1,K317769:1,K659595:1,K157936:1,K612717:1,K883532:1,K633566:1,K693507:1,K463326:1,K849538`
        && `:1,K762442:1|2,2,2,2,2,2,2,2,2,2,2,2` TO rt_cases.
    APPEND `-4|K726602:0,K531354:90880|0,-4` TO rt_cases.
    APPEND `-9|K791981:286611,K518747:271139,K239532:686151|-2,-2,-5` TO rt_cases.
    APPEND `4|K463358:401483,K335172:402808,K638852:464473,K409366:515096,K396597:930791,K847610:597605,K110387:793494|0,0`
        && `,0,1,1,1,1` TO rt_cases.
    APPEND `90243172026|K524461:12,K059623:0,K083411:8,K945848:9,K404299:0,K691972:9,K332413:7,K189310:4,K501397:2,K668200`
        && `:1,K163543:7,K012216:12,K112734:2,K249636:12|12740212521,0,8493475014,9555159391,0,9555159391,7431790637,42467`
        && `37507,2123368754,1061684377,7431790638,12740212521,2123368754,12740212521` TO rt_cases.
    APPEND `6|K052570:2,K223348:1,K373081:5,K237957:7,K595875:12,K753251:0,K699056:11,K714211:10,K937400:8,K763121:12,K095`
        && `577:5|0,0,0,1,1,0,1,1,1,1,0` TO rt_cases.
    APPEND `-318862469209|K646155:11,K421917:5,K992699:0,K459644:0,K352382:2,K155869:10,K775380:11,K118972:11|-70149743226`
        && `,-31886246921,0,0,-12754498768,-63772493842,-70149743226,-70149743226` TO rt_cases.
    APPEND `-843440227488|K481463:1,K165768:1,K569268:1,K470215:1,K061061:1,K303114:1,K914582:1,K065871:1,K648190:1,K66815`
        && `8:1,K782012:1,K867816:1|-70286685624,-70286685624,-70286685624,-70286685624,-70286685624,-70286685624,-7028668`
        && `5624,-70286685624,-70286685624,-70286685624,-70286685624,-70286685624` TO rt_cases.
    APPEND `-6|K314784:1,K078388:1,K463860:1,K129666:1,K954937:1,K667897:1,K853835:1|-1,-1,-1,-1,0,-1,-1` TO rt_cases.
    APPEND `-29|K890976:1,K047828:1,K195653:1,K221077:1,K204519:1,K335813:1,K195330:1,K756396:1,K979473:1,K264865:1,K59414`
        && `3:1,K216303:1|-2,-3,-3,-2,-3,-2,-3,-2,-2,-2,-2,-3` TO rt_cases.
    APPEND `9|K739287:0,K109049:471977,K276346:0,K597786:0|0,9,0,0` TO rt_cases.
    APPEND `11|K452165:1,K797415:1,K487914:1,K572794:1|3,2,3,3` TO rt_cases.
    APPEND `300254077627|K959992:1,K380807:1,K708469:1,K739034:1|75063519406,75063519407,75063519407,75063519407` TO rt_cases.
    APPEND `-14|K947254:101705,K074075:351146,K940240:303505,K938924:932988,K064787:924223,K969450:861040,K304247:439376|-`
        && `1,-1,-1,-3,-3,-3,-2` TO rt_cases.
    APPEND `-708576023445|K239867:1,K420793:1,K349115:1,K548555:1|-177144005862,-177144005861,-177144005861,-177144005861` TO rt_cases.
    APPEND `-64367887417|K803980:11,K544068:10,K945599:1,K512771:5,K020230:2,K196440:5,K476827:4|-18632809515,-16938917741`
        && `,-1693891774,-8469458871,-3387783548,-8469458871,-6775567097` TO rt_cases.
    APPEND `-524477843674|K040128:5,K482710:8,K485533:6,K951165:10|-90427214427,-144683543082,-108512657312,-180854428853` TO rt_cases.
    APPEND `-413729947537|K642854:0,K356102:7,K894173:4,K944383:4|0,-193073975517,-110327986010,-110327986010` TO rt_cases.
    APPEND `4|K298401:1,K155620:1,K999913:1,K465085:1,K819152:1,K259036:1,K921913:1|1,1,0,1,0,1,0` TO rt_cases.
    APPEND `15|K898656:602107,K279083:798390,K373330:161423,K673179:476023,K311600:951260,K369685:462968,K522302:0,K396128`
        && `:473719,K680792:304725,K401886:273845,K243685:478819|2,2,1,1,3,1,0,1,1,1,2` TO rt_cases.
    APPEND `-37|K867552:0,K165061:964104,K031753:875031,K228040:669290,K841392:520169,K712392:34735,K386167:59147,K733086:`
        && `559935,K547308:646602,K732331:540378,K558243:10083,K943848:361152,K608123:62815|0,-7,-6,-5,-4,0,0,-4,-4,-4,0,-`
        && `3,0` TO rt_cases.
    APPEND `15|K395834:607745,K076159:159761,K698523:328502,K284425:628399,K983894:862278|3,1,2,4,5` TO rt_cases.
    APPEND `703332722913|K716299:2,K541385:12,K502028:12,K145287:11,K991996:1,K930723:8,K504784:10,K401775:7,K958426:6,K49`
        && `8844:3|19537020081,117222120485,117222120486,107453610445,9768510040,78148080324,97685100405,68379570283,58611`
        && `060243,29305530121` TO rt_cases.
    APPEND `-34|K181717:317868,K009910:339878,K758009:7163,K869352:437349,K453301:123311,K524144:0,K733755:931791,K269331:`
        && `603352,K054532:173440,K195389:652902,K719987:0,K294300:846038,K483302:752923,K428328:0|-2,-2,0,-3,-1,0,-6,-4,-`
        && `1,-4,0,-6,-5,0` TO rt_cases.
    APPEND `-31|K638706:356115,K116966:289117,K997786:420809,K075472:378405,K261579:0,K119389:752759,K524304:851316,K87021`
        && `4:0,K239290:717717,K915614:92810,K347433:223418|-3,-2,-3,-3,0,-6,-6,0,-5,-1,-2` TO rt_cases.
    APPEND `-33|K443849:1,K903439:1,K415558:1,K731868:1,K094097:1,K452953:1,K365429:1,K442299:1,K087450:1,K097261:1,K40573`
        && `5:1|-3,-3,-3,-3,-3,-3,-3,-3,-3,-3,-3` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_08.
    APPEND `36|K978245:1,K139859:1,K074238:1,K522259:1,K308909:1,K515580:1,K693594:1,K897183:1,K198896:1,K516408:1,K483121`
        && `:1,K829967:1|3,3,3,3,3,3,3,3,3,3,3,3` TO rt_cases.
    APPEND `4|K990263:1,K151783:1,K155837:1,K147231:1,K648093:1,K306581:1|0,1,1,1,0,1` TO rt_cases.
    APPEND `-10|K764347:72913,K840535:549970,K601243:657178,K445395:600677,K685222:0,K187980:390827,K842128:0,K992404:3619`
        && `39,K067322:737731,K281770:501335,K788666:359070,K735128:478235,K163506:847453|0,-1,-1,-1,0,-1,0,-1,-1,-1,-1,-1`
        && `,-1` TO rt_cases.
    APPEND `8|K480137:255326,K408009:834003,K091394:0,K369927:540142,K589112:779742|1,3,0,2,2` TO rt_cases.
    APPEND `21|K904462:389009,K844830:596770,K958505:0,K101796:0,K543443:424940,K495815:159108,K291521:576685,K788378:5220`
        && `73,K231203:104582,K660132:166517,K494654:671638,K300913:54107,K570898:0,K556303:806116|2,3,0,0,2,1,3,2,0,1,3,0`
        && `,0,4` TO rt_cases.
    APPEND `-28|K196114:1,K250355:1,K026902:1,K467369:1,K123992:1,K899726:1,K061851:1,K093659:1,K894936:1,K549016:1,K49837`
        && `7:1,K896657:1,K962595:1,K449017:1|-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `308984285255|K445124:1,K046243:1,K974222:1,K897487:1,K480506:1,K165181:1,K180170:1,K685232:1,K147346:1,K589234`
        && `:1|30898428526,30898428526,30898428525,30898428525,30898428525,30898428526,30898428526,30898428525,30898428526`
        && `,30898428525` TO rt_cases.
    APPEND `-5|K534452:274821,K278018:0|-5,0` TO rt_cases.
    APPEND `0|K643043:619688,K948207:817150,K815409:902163,K222872:491687,K317079:321088,K364008:909644|0,0,0,0,0,0` TO rt_cases.
    APPEND `-21|K851374:1,K388714:1,K328605:1,K570485:1,K311399:1,K866895:1,K805676:1|-3,-3,-3,-3,-3,-3,-3` TO rt_cases.
    APPEND `-370587942086|K208220:1|-370587942086` TO rt_cases.
    APPEND `-206974074053|K782828:6,K532032:10,K936664:6,K115299:1,K669463:5,K431659:5,K963825:0,K026129:2,K121541:4,K0028`
        && `39:5,K436271:3,K513657:4|-24349891065,-40583151775,-24349891065,-4058315177,-20291575888,-20291575888,0,-81166`
        && `30355,-16233260710,-20291575888,-12174945532,-16233260710` TO rt_cases.
    APPEND `16|K360425:1,K597364:1,K993177:1,K080447:1,K123797:1,K826727:1,K680029:1,K227645:1,K101053:1,K243440:1,K571182`
        && `:1|1,1,1,2,2,1,1,2,2,2,1` TO rt_cases.
    APPEND `8|K016721:1,K487095:1,K511461:1,K632219:1,K832812:1|2,2,2,1,1` TO rt_cases.
    APPEND `-6|K770557:1,K013934:1,K955449:1|-2,-2,-2` TO rt_cases.
    APPEND `-5|K278472:176894,K744334:798138,K559241:0,K853968:633634,K361178:335829,K784843:747790,K525329:0,K716041:0,K8`
        && `18569:822013,K405644:370738,K850305:351862|0,-1,0,-1,0,-1,0,0,-1,-1,0` TO rt_cases.
    APPEND `25|K164981:1,K248460:1,K463998:1,K104773:1,K734402:1,K178186:1,K163166:1,K502258:1,K872808:1,K480777:1,K484904`
        && `:1,K185150:1,K007578:1|2,2,2,2,2,2,2,2,1,2,2,2,2` TO rt_cases.
    APPEND `-976008560243|K762218:1,K010183:1,K217089:1,K541540:1,K638475:1,K396315:1,K384912:1,K827294:1,K257565:1,K47188`
        && `8:1,K104999:1,K819261:1|-81334046687,-81334046687,-81334046687,-81334046687,-81334046687,-81334046687,-8133404`
        && `6687,-81334046686,-81334046687,-81334046687,-81334046687,-81334046687` TO rt_cases.
    APPEND `7|K778858:0,K990817:491577,K844600:529797,K582406:877260,K176589:931953|0,1,2,2,2` TO rt_cases.
    APPEND `-29|K993967:1,K501594:1,K168242:1,K623717:1,K133497:1,K225823:1,K710487:1,K488840:1,K736566:1,K547923:1,K38960`
        && `8:1,K205215:1,K008870:1,K691302:1|-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-3,-2` TO rt_cases.
    APPEND `2|K732054:1,K812701:0|2,0` TO rt_cases.
    APPEND `1|K498239:3,K620618:0|1,0` TO rt_cases.
    APPEND `29|K314093:1,K834217:1,K898998:1,K418666:1,K565323:1,K794143:1,K908585:1,K493009:1,K880162:1,K871965:1,K250368`
        && `:1|3,3,2,3,3,3,2,3,2,2,3` TO rt_cases.
    APPEND `21|K477263:0,K634424:576891,K035266:270419,K366025:599294,K360031:105933,K293979:509444,K174988:555566,K918561`
        && `:909115,K514918:134847,K317691:0,K940788:0|0,3,2,3,1,3,3,5,1,0,0` TO rt_cases.
    APPEND `-2|K266295:1|-2` TO rt_cases.
    APPEND `12|K479330:691775,K236310:0,K225550:855753,K630280:797892|4,0,4,4` TO rt_cases.
    APPEND `-660264679569|K795880:3,K126983:6,K199444:5,K962341:0,K063844:7,K344501:1,K324460:1,K141403:1|-82533084946,-16`
        && `5066169892,-137555141577,0,-192577198208,-27511028315,-27511028315,-27511028316` TO rt_cases.
    APPEND `7|K503502:2,K368268:2,K520281:9|1,1,5` TO rt_cases.
    APPEND `176807564674|K206791:1,K458901:1,K157231:1,K099348:1,K180399:1,K668976:1,K814285:1,K395636:1,K101066:1,K756793`
        && `:1|17680756467,17680756467,17680756468,17680756468,17680756468,17680756467,17680756467,17680756467,17680756468`
        && `,17680756467` TO rt_cases.
    APPEND `2|K971615:1|2` TO rt_cases.
    APPEND `50314951707|K792761:1,K395249:1,K297705:1,K636812:1,K161174:1,K393405:1,K830341:1|7187850244,7187850244,718785`
        && `0244,7187850244,7187850244,7187850244,7187850243` TO rt_cases.
    APPEND `-10|K373933:483165,K641370:0,K465493:0,K694566:81305,K425135:235203,K134952:719567,K176712:0,K466977:392313,K6`
        && `96815:307378|-2,0,0,0,-1,-3,0,-2,-2` TO rt_cases.
    APPEND `9280740866|K402244:1,K221260:1,K375496:1,K639876:1,K967726:1,K223094:1,K641020:1,K059287:1,K165022:1,K349704:1`
        && `,K921578:1,K998269:1|773395072,773395072,773395072,773395072,773395072,773395072,773395072,773395073,773395073`
        && `,773395072,773395072,773395072` TO rt_cases.
    APPEND `-3|K591861:899590|-3` TO rt_cases.
    APPEND `14|K907514:739377,K120282:151480,K185033:525885,K906017:0,K188564:239161|6,1,5,0,2` TO rt_cases.
    APPEND `-22|K554608:1,K264212:1,K586526:1,K392546:1,K656442:1,K207250:1,K689884:1,K764196:1,K962513:1,K615220:1,K19150`
        && `7:1|-2,-2,-2,-2,-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `-537918009289|K278473:1,K499684:1,K079659:1,K453025:1,K054980:1,K421107:1,K711374:1,K032677:1,K725922:1,K96972`
        && `4:1,K973438:1|-48901637208,-48901637208,-48901637208,-48901637208,-48901637208,-48901637208,-48901637208,-4890`
        && `1637209,-48901637208,-48901637208,-48901637208` TO rt_cases.
    APPEND `-375891452177|K081859:1,K420425:3,K909155:0,K548369:3,K515627:5,K037281:3,K210726:3,K907690:5|-16343106617,-49`
        && `029319849,0,-49029319849,-81715533082,-49029319849,-49029319849,-81715533082` TO rt_cases.
    APPEND `-786906388426|K298379:8,K555380:3,K034348:10,K535979:10|-203072616368,-76152231138,-253840770460,-253840770460` TO rt_cases.
    APPEND `9|K352834:12,K870746:6,K165100:2|5,3,1` TO rt_cases.
    APPEND `-41|K382946:1,K322877:1,K712002:1,K702631:1,K357724:1,K078648:1,K259995:1,K039052:1,K651339:1,K724499:1,K02197`
        && `2:1,K557690:1,K119557:1,K671849:1|-3,-3,-3,-3,-3,-3,-3,-3,-3,-2,-3,-3,-3,-3` TO rt_cases.
    APPEND `-15|K931214:0,K038051:0,K785465:409870,K277321:955301,K676511:142697,K964041:294296|0,0,-3,-8,-1,-3` TO rt_cases.
    APPEND `12|K399354:545477,K304273:417798,K512623:534054,K144033:565611,K401936:302690,K499782:567165,K920922:520471,K2`
        && `60112:333736,K679741:787197,K205069:395911,K428868:0,K452651:564184,K952660:23686|1,1,1,1,1,1,1,1,2,1,0,1,0` TO rt_cases.
    APPEND `-5|K672561:929224,K330278:886825,K133302:771341|-2,-2,-1` TO rt_cases.
    APPEND `1|K435998:541362|1` TO rt_cases.
    APPEND `21|K230983:1,K498461:1,K614540:1,K032310:1,K400970:1,K134058:1,K426815:1,K741349:1|3,2,2,3,3,3,3,2` TO rt_cases.
    APPEND `-1|K720993:5,K708346:4,K925741:2,K657534:0,K234479:3,K776179:10|0,0,0,0,0,-1` TO rt_cases.
    APPEND `-1|K594727:1,K070711:1|0,-1` TO rt_cases.
    APPEND `-4|K175303:1,K365118:1,K734530:1,K474971:1,K426282:1,K086932:1|-1,-1,0,0,-1,-1` TO rt_cases.
    APPEND `13|K934309:531926,K802801:765578,K397680:261704,K174702:151428,K820432:364850,K648037:361314,K472762:947160,K9`
        && `73551:543432,K313371:199337,K199281:701417,K736749:170019|1,2,1,0,1,1,3,1,1,2,0` TO rt_cases.
    APPEND `-4|K983188:3,K444329:10,K492560:4,K304452:4,K382116:8,K296896:6|0,-1,0,-1,-1,-1` TO rt_cases.
    APPEND `6|K806536:1,K666965:1,K560110:1,K318855:1,K274918:1,K717747:1,K406517:1,K223736:1,K660880:1|0,0,1,1,1,0,1,1,1` TO rt_cases.
    APPEND `875514892015|K589007:1,K958805:1,K893383:1,K608992:1,K364101:1,K383720:1,K697541:1,K774858:1,K000961:1,K100855`
        && `:1,K705185:1|79592262911,79592262910,79592262910,79592262910,79592262911,79592262911,79592262910,79592262910,7`
        && `9592262911,79592262911,79592262910` TO rt_cases.
    APPEND `-5|K802807:0,K244708:20993,K330658:0,K255561:573658,K210546:778412,K995115:288640,K138420:0,K021991:237715,K31`
        && `9532:525696|0,0,0,-1,-2,-1,0,0,-1` TO rt_cases.
    APPEND `7|K927755:506516,K650121:991178,K772297:681793,K394928:112894,K066985:30394,K219529:762769,K003265:165117,K645`
        && `711:0,K211562:533406|1,2,1,0,0,2,0,0,1` TO rt_cases.
    APPEND `4|K304291:1,K507022:1,K958182:1,K473337:1,K941531:1,K219328:1|1,1,0,1,0,1` TO rt_cases.
    APPEND `7|K028398:0,K117611:544792,K086162:63828|0,6,1` TO rt_cases.
    APPEND `3|K563159:473062|3` TO rt_cases.
    APPEND `-9|K347819:1,K963762:1,K537933:1,K189389:1,K230386:1,K343833:1,K797800:1|-1,-1,-1,-2,-2,-1,-1` TO rt_cases.
    APPEND `-498822937419|K024888:3,K686173:0,K277606:12|-99764587484,0,-399058349935` TO rt_cases.
    APPEND `-347596827240|K933449:12,K722172:9,K632795:10|-134553610545,-100915207908,-112128008787` TO rt_cases.
    APPEND `-228529526724|K860890:1,K850467:1,K316587:1,K646426:1,K829642:1,K000155:1,K441364:1,K430135:1,K581970:1,K01988`
        && `0:1|-22852952672,-22852952672,-22852952673,-22852952672,-22852952672,-22852952673,-22852952672,-22852952673,-2`
        && `2852952672,-22852952673` TO rt_cases.
    APPEND `11|K793074:0,K573195:611755,K139212:0,K021167:367637,K064390:979552,K470001:951264|0,2,0,1,4,4` TO rt_cases.
    APPEND `-10|K489219:783770,K615846:602007,K568975:829700,K210696:562575,K136505:888265,K797343:764711,K472428:558988,K`
        && `028428:0,K277372:531477,K824955:614595,K529752:110083,K315880:271987|-1,-1,-1,-1,-1,-1,-1,0,-1,-1,0,-1` TO rt_cases.
    APPEND `944202330887|K516537:9,K639804:12,K090053:9,K020304:10,K350638:9,K075334:6,K253316:6,K247031:6,K228864:7|11483`
        && `5418621,153113891495,114835418621,127594909579,114835418621,76556945748,76556945748,76556945748,89316436706` TO rt_cases.
    APPEND `419390651087|K276312:3,K868450:3,K399021:5,K562661:9,K778630:7,K136812:12,K253035:5,K507555:1,K150281:12,K8687`
        && `06:8,K493129:5|17973885047,17973885046,29956475078,53921655140,41939065109,71895540186,29956475078,5991295015,`
        && `71895540186,47930360124,29956475078` TO rt_cases.
    APPEND `-883281595740|K403494:6,K920201:7,K780005:5,K961129:8,K666428:0,K762457:6,K876843:4,K033009:6,K270551:0,K63050`
        && `8:5,K568508:5,K925588:3,K702246:9,K089164:8|-73606799645,-85874599586,-61338999704,-98142399527,0,-73606799645`
        && `,-49071199763,-73606799645,0,-61338999704,-61338999704,-36803399822,-110410199468,-98142399527` TO rt_cases.
    APPEND `-1|K942921:67012,K630350:487436|0,-1` TO rt_cases.
    APPEND `1|K896590:1|1` TO rt_cases.
    APPEND `-152941608529|K044967:5,K403943:5,K181358:12,K175351:10,K031313:1,K035367:5,K160042:2,K566834:3,K269005:4,K784`
        && `387:8,K566754:5,K713088:9,K098252:7,K350889:4|-9558850533,-9558850533,-22941241279,-19117701066,-1911770107,-9`
        && `558850533,-3823540213,-5735310320,-7647080427,-15294160853,-9558850533,-17205930960,-13382390746,-7647080426` TO rt_cases.
    APPEND `21710273554|K920407:1,K391827:1,K679481:1,K218298:1,K681309:1,K232270:1,K092730:1,K725139:1|2713784194,2713784`
        && `194,2713784194,2713784195,2713784194,2713784194,2713784195,2713784194` TO rt_cases.
    APPEND `-1|K607496:728519|-1` TO rt_cases.
    APPEND `-941649985604|K698228:1,K137358:1,K475577:1,K140177:1,K201967:1,K375611:1,K342380:1,K355658:1,K685614:1,K87359`
        && `7:1,K316842:1,K770063:1,K853796:1|-72434614277,-72434614278,-72434614277,-72434614278,-72434614278,-7243461427`
        && `7,-72434614277,-72434614277,-72434614277,-72434614277,-72434614277,-72434614277,-72434614277` TO rt_cases.
    APPEND `-22|K214552:1,K970236:1,K336059:1,K829620:1,K882651:1,K297071:1,K304077:1,K974238:1|-3,-2,-3,-3,-3,-3,-3,-2` TO rt_cases.
    APPEND `-17|K184598:9,K761016:3,K133889:0,K802779:7,K970617:0,K849946:3,K189452:12,K180877:5|-4,-2,0,-3,0,-1,-5,-2` TO rt_cases.
    APPEND `-1|K986508:1,K268735:1,K033050:1,K559273:1,K568786:1,K516263:1|0,0,-1,0,0,0` TO rt_cases.
    APPEND `237790397282|K343382:9,K146737:10,K758244:0,K557426:2,K469965:0,K114891:4,K493903:2|79263465761,88070517512,0,`
        && `17614103502,0,35228207005,17614103502` TO rt_cases.
    APPEND `-18|K880638:914597,K409101:399105,K770917:603012,K359489:974165,K361555:571980,K805813:473239,K331370:198629,K`
        && `508560:571239,K176167:0|-3,-2,-2,-4,-2,-2,-1,-2,0` TO rt_cases.
    APPEND `-25|K230433:217466,K170101:696478,K430194:697125,K042659:356136,K292181:964510,K073896:697561,K796899:140160,K`
        && `832418:430856,K643405:929236,K615083:0,K959949:329268,K783783:0|-1,-3,-3,-2,-4,-3,-1,-2,-4,0,-2,0` TO rt_cases.
    APPEND `-20|K496044:1,K179482:1,K454751:1,K210518:1,K993107:1,K785845:1,K548414:1,K086479:1,K872562:1,K509239:1,K02576`
        && `3:1|-2,-2,-2,-2,-1,-2,-2,-2,-1,-2,-2` TO rt_cases.
    APPEND `7925828816|K334872:577396,K498040:522050,K062131:191966,K243703:285475,K048869:724184,K476235:322532,K944324:6`
        && `93438,K472733:0,K006939:766678,K807657:0,K269166:720019|952662667,861345671,316730357,471013611,1194852512,532`
        && `155047,1144123781,0,1264964614,0,1187980556` TO rt_cases.
    APPEND `2|K184180:710313|2` TO rt_cases.
    APPEND `13|K535680:1,K878251:1,K803682:1,K001585:1,K103184:1,K407153:1,K406678:1,K488689:1,K322252:1,K936566:1,K098553`
        && `:1,K510271:1|1,1,1,2,1,1,1,1,1,1,1,1` TO rt_cases.
    APPEND `-19|K072650:0,K012585:452052,K831104:264817,K123361:0,K092005:756895,K979194:0,K898587:0,K048797:0,K815864:732`
        && `169,K532048:413016,K672933:171720,K084699:910658|0,-2,-1,0,-4,0,0,0,-4,-2,-1,-5` TO rt_cases.
    APPEND `-589845494173|K971197:6,K189926:5,K941717:8,K315008:5,K936244:6,K667589:11,K806916:9,K744928:11,K339284:1,K074`
        && `492:0|-57081822017,-47568185014,-76109096022,-47568185014,-57081822017,-104650007031,-85622733025,-10465000703`
        && `0,-9513637003,0` TO rt_cases.
    APPEND `-77730535796|K842638:4,K140676:10,K871143:5,K832497:4,K848348:12,K163645:11,K372468:9,K297209:9,K988548:0,K324`
        && `845:9,K168135:6,K605453:7,K095076:0,K168619:0|-3615373758,-9038434395,-4519217198,-3615373758,-10846121274,-99`
        && `42277834,-8134590955,-8134590955,0,-8134590955,-5423060637,-6326904077,0,0` TO rt_cases.
    APPEND `-1|K198493:1|-1` TO rt_cases.
    APPEND `857788248697|K974105:1,K779795:1|428894124348,428894124349` TO rt_cases.
    APPEND `-2|K291556:646524,K028981:780069,K140524:116181,K895263:825626|0,-1,0,-1` TO rt_cases.
    APPEND `8|K912657:874691,K218294:285721,K481060:729784,K686765:807061,K802254:867878|2,1,1,2,2` TO rt_cases.
    APPEND `9|K676059:109570,K840044:60053,K730783:0|6,3,0` TO rt_cases.
    APPEND `-545477426952|K961002:1,K348933:1,K432741:1,K101498:1,K527634:1,K639176:1,K557793:1,K534065:1,K801156:1,K51535`
        && `2:1,K894207:1,K800688:1|-45456452246,-45456452246,-45456452246,-45456452246,-45456452246,-45456452246,-4545645`
        && `2246,-45456452246,-45456452246,-45456452246,-45456452246,-45456452246` TO rt_cases.
    APPEND `5|K509700:0,K635491:489532|0,5` TO rt_cases.
    APPEND `171495045856|K375733:10,K742938:2,K281861:7|90260550451,18052110090,63182385315` TO rt_cases.
    APPEND `1|K808838:258384|1` TO rt_cases.
    APPEND `3|K872705:7,K591565:12|1,2` TO rt_cases.
    APPEND `-316175133152|K183963:1,K475361:1|-158087566576,-158087566576` TO rt_cases.
    APPEND `-6|K895640:1,K256290:1,K462628:1|-2,-2,-2` TO rt_cases.
    APPEND `581033515445|K728604:11,K082659:11,K448609:1,K784693:9,K346545:11,K470437:8,K856077:4,K032803:10,K502144:6|900`
        && `19277041,90019277041,8183570640,73652135761,90019277041,65468565120,32734282560,81835706401,49101423840` TO rt_cases.
    APPEND `5|K567445:225783,K199877:0,K504646:782150,K608080:888576,K521590:917828,K341315:0,K729060:730466,K691193:41096`
        && `9,K354656:909313,K814838:185220,K941537:562037,K315776:715546,K996019:776511,K343374:338745|0,0,1,1,1,0,0,0,1,`
        && `0,0,0,1,0` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_09.
    APPEND `9294341617|K855112:1,K263642:1,K656273:1,K969198:1,K218109:1,K595788:1|1549056936,1549056936,1549056936,154905`
        && `6936,1549056937,1549056936` TO rt_cases.
    APPEND `-3|K894466:0,K800704:155370,K015901:0,K974287:0,K329877:0,K114322:0,K935910:0,K268590:204633,K859136:1961,K931`
        && `583:573244|0,0,0,0,0,0,0,-1,0,-2` TO rt_cases.
    APPEND `7|K397644:1,K649481:1,K341321:1,K654935:1,K950986:1|2,1,2,1,1` TO rt_cases.
    APPEND `-557717695820|K837421:11,K357883:9,K922921:7,K391873:0,K860256:7,K749240:1,K562897:9|-139429423955,-1140786196`
        && `00,-88727815244,0,-88727815244,-12675402178,-114078619599` TO rt_cases.
    APPEND `-550705354420|K347522:1,K746071:1,K742063:1,K228667:1,K051913:1,K670288:1,K469680:1,K917298:1,K063744:1,K78412`
        && `3:1|-55070535442,-55070535442,-55070535442,-55070535442,-55070535442,-55070535442,-55070535442,-55070535442,-5`
        && `5070535442,-55070535442` TO rt_cases.
    APPEND `-28|K020258:0,K194058:138408,K907686:186420,K724619:896975,K775206:698601,K791200:237021,K419420:684230,K01783`
        && `8:212306,K940424:742634,K830480:366885,K040690:0|0,-1,-1,-6,-5,-2,-5,-1,-5,-2,0` TO rt_cases.
    APPEND `349302437858|K542402:1,K480560:1,K452912:1,K442717:1,K729650:1,K858199:1,K151473:1,K912212:1,K415131:1,K485860`
        && `:1,K013697:1|31754767078,31754767078,31754767078,31754767078,31754767078,31754767078,31754767078,31754767078,3`
        && `1754767078,31754767078,31754767078` TO rt_cases.
    APPEND `-5|K780726:1,K613016:1,K377048:1,K734388:1,K742835:1|-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `36|K287791:4,K528266:10,K162073:1,K524696:5,K726533:8,K515322:4,K812844:0,K611458:3,K278963:5,K966263:5,K26999`
        && `2:3,K551554:1|3,7,1,4,6,3,0,2,4,3,2,1` TO rt_cases.
    APPEND `4|K965023:777623,K292046:577990|2,2` TO rt_cases.
    APPEND `9|K523882:320761,K681531:910965,K617909:577040,K553856:734800|1,3,2,3` TO rt_cases.
    APPEND `-21|K250631:11,K822723:8,K994615:10,K988740:12,K234764:6,K723753:2,K146362:9,K773025:10,K162064:4,K016169:5,K7`
        && `10895:12,K543091:1,K460418:8,K837695:5|-2,-2,-2,-2,-1,0,-2,-2,-1,-1,-3,0,-2,-1` TO rt_cases.
    APPEND `538115729459|K180580:8|538115729459` TO rt_cases.
    APPEND `2|K417366:100590,K437209:835201,K468703:726599,K676624:0,K478134:183255,K356407:358875|0,1,1,0,0,0` TO rt_cases.
    APPEND `-10|K408774:10,K038177:1,K651093:9,K284349:0,K662040:0,K671755:12|-3,0,-3,0,0,-4` TO rt_cases.
    APPEND `13|K859317:577975,K691060:681376,K565459:837181,K217506:306351,K626038:744664,K614421:567956,K140365:707724,K8`
        && `25922:360675,K509851:0,K866216:479855,K480036:878846,K659655:0|1,1,2,1,2,1,1,1,0,1,2,0` TO rt_cases.
    APPEND `-455912259965|K588636:10,K246664:9,K263950:6,K544778:12,K159181:2,K817041:11,K103426:0,K581228:1,K672764:1,K27`
        && `6133:5|-79984607011,-71986146310,-47990764207,-95981528414,-15996921402,-87983067713,0,-7998460701,-7998460701`
        && `,-39992303506` TO rt_cases.
    APPEND `-22|K124517:0,K319162:58822,K211205:544633,K479790:0,K686427:497148,K769263:112970,K504241:0,K654774:189657,K6`
        && `09965:933967,K023112:0,K158423:0|0,0,-5,0,-5,-1,0,-2,-9,0,0` TO rt_cases.
    APPEND `10|K153523:1,K143070:1,K053312:1,K508385:1,K064324:1,K005381:1,K977431:1,K718615:1,K841637:1,K246057:1,K729666`
        && `:1,K204869:1|1,1,1,1,1,1,0,1,0,1,1,1` TO rt_cases.
    APPEND `36|K804113:576242,K294653:0,K701462:399601,K176261:330115,K337059:233091,K152494:645393,K210470:849764,K129325`
        && `:9657,K373377:240580,K824674:997375,K611878:632081,K607056:193482,K483919:766558,K347100:102073|4,0,2,2,1,4,5,`
        && `0,1,6,4,1,5,1` TO rt_cases.
    APPEND `629633856556|K129718:1,K641610:1,K769236:1,K033168:1,K487154:1|125926771311,125926771311,125926771311,12592677`
        && `1312,125926771311` TO rt_cases.
    APPEND `-343847551242|K372280:1,K739522:1,K294439:1,K847055:1,K317525:1,K026358:1|-57307925207,-57307925207,-573079252`
        && `07,-57307925207,-57307925207,-57307925207` TO rt_cases.
    APPEND `18|K027527:71059,K474264:331259,K079187:0,K853760:780604,K845328:0,K427739:77210,K133933:0,K495040:439906,K100`
        && `499:588409,K433948:520777|0,2,0,5,0,1,0,3,4,3` TO rt_cases.
    APPEND `9|K275468:1,K809657:1,K170621:1,K589937:1,K498959:1,K599302:1,K804476:1,K607347:1,K550538:1,K910219:1,K137956:`
        && `1|1,0,1,1,1,1,1,1,1,0,1` TO rt_cases.
    APPEND `-235477184932|K604137:3,K629101:7,K549911:5,K658355:4,K606780:9,K380135:9,K534488:5,K864219:1,K644212:10,K5040`
        && `15:4,K397323:2,K243465:5,K876591:11|-9419087397,-21977870594,-15698478995,-12558783196,-28257262192,-282572621`
        && `92,-15698478996,-3139695799,-31396957991,-12558783196,-6279391598,-15698478996,-34536653790` TO rt_cases.
    APPEND `-4|K731247:236689,K525353:606422|-1,-3` TO rt_cases.
    APPEND `817760933265|K739846:1|817760933265` TO rt_cases.
    APPEND `-742671709787|K404597:3,K745020:11,K974231:1,K459709:11,K898081:11,K099709:3,K389494:7,K221894:5,K142226:12,K4`
        && `13581:9|-30520755197,-111909435721,-10173585066,-111909435721,-111909435721,-30520755197,-71215095459,-5086792`
        && `5328,-122083020787,-91562265590` TO rt_cases.
    APPEND `-16|K651826:0,K995073:0,K127175:118438,K453703:73010,K227313:85605,K600589:451409,K192552:43519,K026915:22058,`
        && `K976565:887313,K267542:182434,K314254:896791,K876383:723226,K338728:0|0,0,-1,0,-1,-2,0,0,-4,-1,-4,-3,0` TO rt_cases.
    APPEND `-16|K717340:2,K874741:5,K659992:5,K306925:7,K579658:0,K723760:8,K843137:6,K420844:8,K082185:6,K801160:8,K57421`
        && `9:10,K137846:6|-1,-1,-1,-2,0,-2,-1,-2,-1,-2,-2,-1` TO rt_cases.
    APPEND `3|K527065:705066,K198405:474586|2,1` TO rt_cases.
    APPEND `-419393964673|K873260:1,K079467:1,K443165:1,K429606:1,K693788:1,K762432:1,K512734:1,K068650:1,K507566:1,K05225`
        && `3:1|-41939396467,-41939396468,-41939396467,-41939396467,-41939396467,-41939396467,-41939396467,-41939396468,-4`
        && `1939396467,-41939396468` TO rt_cases.
    APPEND `23|K447766:11,K292390:6,K384051:5,K682723:10,K580671:3,K082818:4,K288026:1,K267287:8,K282810:5,K060583:12,K332`
        && `000:12,K680682:12,K334526:10,K366186:11|2,1,1,2,1,1,0,2,1,3,3,2,2,2` TO rt_cases.
    APPEND `-8772099258|K839675:542324,K869432:682882,K504790:615267,K492152:513842,K002823:579403,K863979:738871,K697700:`
        && `525642,K684368:343888,K060613:23668|-1041949604,-1311999155,-1182092637,-987228057,-1113188291,-1419569014,-10`
        && `09899016,-660700919,-45472565` TO rt_cases.
    APPEND `2|K838422:1|2` TO rt_cases.
    APPEND `4|K816668:3,K036550:3,K727477:7,K741930:1,K646532:3,K782637:1,K362187:1,K619883:11,K446078:2,K491556:6,K077702`
        && `:0,K763064:9|0,0,1,0,0,0,0,1,0,1,0,1` TO rt_cases.
    APPEND `-395080578792|K913685:1,K193107:1,K580202:1,K801524:1,K651998:1,K148038:1,K984052:1|-56440082684,-56440082685,`
        && `-56440082685,-56440082684,-56440082685,-56440082685,-56440082684` TO rt_cases.
    APPEND `-5|K341070:1,K906395:1|-3,-2` TO rt_cases.
    APPEND `-477139296000|K372408:1,K378141:1,K997395:1,K450919:1,K334081:1|-95427859200,-95427859200,-95427859200,-954278`
        && `59200,-95427859200` TO rt_cases.
    APPEND `-11|K783831:356135,K510582:548708,K016150:888207,K354089:725101,K581874:508477,K826183:307735,K112322:395625,K`
        && `720337:96273,K453012:215575,K408368:164847,K923783:746011,K928781:0,K968280:636102,K141179:362942|-1,-1,-2,-1,`
        && `-1,-1,-1,0,0,0,-1,0,-1,-1` TO rt_cases.
    APPEND `670282504481|K985900:1,K845821:1|335141252240,335141252241` TO rt_cases.
    APPEND `8|K055417:1,K699937:1,K979087:1|3,3,2` TO rt_cases.
    APPEND `-143478144053|K997125:1,K069764:1,K589249:1,K842753:1|-35869536013,-35869536014,-35869536013,-35869536013` TO rt_cases.
    APPEND `365433597579|K826997:4,K605962:7,K071779:2,K353951:8,K671558:12,K324644:5,K899041:2,K762974:12,K953981:0,K6567`
        && `36:1,K317512:4|25644462988,44877810229,12822231494,51288925976,76933388964,32055578735,12822231494,76933388964`
        && `,0,6411115747,25644462988` TO rt_cases.
    APPEND `807677248698|K978937:1,K937179:1,K763964:1,K400432:1,K380050:1,K826430:1,K335914:1,K723781:1,K669233:1,K118971`
        && `:1,K463002:1,K164931:1,K355451:1|62129019130,62129019130,62129019130,62129019131,62129019131,62129019130,62129`
        && `019131,62129019130,62129019131,62129019131,62129019131,62129019131,62129019131` TO rt_cases.
    APPEND `0|K342427:0,K932280:108656,K559244:107804,K533206:878191,K522289:184301,K422855:591464,K570002:0,K008394:0|0,0`
        && `,0,0,0,0,0,0` TO rt_cases.
    APPEND `40015685268|K512132:1,K753909:0,K650288:6,K214225:0,K427686:12,K690372:7,K478284:5,K025790:2,K691545:10,K30697`
        && `2:0|930597332,0,5583583991,0,11167167982,6514181323,4652986659,1861194663,9305973318,0` TO rt_cases.
    APPEND `979543747280|K792714:1,K021998:2,K570754:12,K712370:2,K437230:7,K518882:5|33777370596,67554741192,405328447150`
        && `,67554741192,236441594171,168886852979` TO rt_cases.
    APPEND `7|K767094:868317,K880598:917825,K380326:0,K189590:714482,K713449:692587,K426013:0|2,2,0,2,1,0` TO rt_cases.
    APPEND `-14|K045072:657111,K386898:478399,K311291:352767,K287179:896319,K300554:874884,K015871:842704,K661644:229758,K`
        && `820520:0,K396363:711770,K530130:887650,K708898:146097|-1,-1,-1,-2,-2,-2,-1,0,-2,-2,0` TO rt_cases.
    APPEND `21|K100857:710817,K420026:938175,K738313:171335,K909709:780023,K394231:143134,K464756:0,K562879:694038,K243387`
        && `:585080,K683783:0,K483554:0,K541151:118095|4,5,1,4,1,0,3,3,0,0,0` TO rt_cases.
    APPEND `13|K568161:7,K575776:12,K238442:4,K621510:1,K517500:10,K651486:10,K657425:1,K296111:4,K426592:1,K301194:11,K27`
        && `1691:2|2,3,1,0,2,2,0,1,0,2,0` TO rt_cases.
    APPEND `-919315892151|K489715:1,K857810:1,K472714:1,K986433:1,K389704:1,K934690:1,K149791:1,K216209:1,K947262:1|-10214`
        && `6210239,-102146210239,-102146210239,-102146210239,-102146210239,-102146210239,-102146210239,-102146210239,-102`
        && `146210239` TO rt_cases.
    APPEND `-2|K192970:1,K354560:1|-1,-1` TO rt_cases.
    APPEND `-416106150960|K299212:1,K152507:1,K891796:1,K150520:1,K458192:1,K923405:1,K711927:1,K163340:1|-52013268870,-52`
        && `013268870,-52013268870,-52013268870,-52013268870,-52013268870,-52013268870,-52013268870` TO rt_cases.
    APPEND `16|K127978:2,K350788:4,K622532:12,K601527:8,K765001:12,K941224:10|1,1,4,3,4,3` TO rt_cases.
    APPEND `9|K096990:1,K773890:1,K120837:1,K597614:1,K202583:1,K535296:1,K175475:1,K639657:1,K743061:1,K833227:1,K610912:`
        && `1,K451873:1|1,0,1,1,1,1,1,1,0,0,1,1` TO rt_cases.
    APPEND `-35|K525241:1,K445047:1,K772197:1,K667528:1,K716809:1,K035502:1,K283116:1,K340998:1,K426939:1,K424725:1,K41266`
        && `5:1,K418161:1|-3,-3,-2,-3,-3,-3,-3,-3,-3,-3,-3,-3` TO rt_cases.
    APPEND `5|K989555:175785,K015788:896073,K335552:157638,K550713:213481,K131541:617128,K459222:354340|0,2,0,1,1,1` TO rt_cases.
    APPEND `-3|K880447:1,K160443:1,K305915:1,K666324:1,K961082:1|0,-1,-1,-1,0` TO rt_cases.
    APPEND `680734545412|K099585:3,K535152:3,K062427:9,K844056:1,K647163:1,K261094:7,K959214:12,K683757:12,K676642:6,K3310`
        && `96:4,K759441:2,K495821:1,K034501:8,K592026:8|26522125146,26522125146,79566375438,8840708382,8840708382,6188495`
        && `8674,106088500583,106088500583,53044250292,35362833528,17681416764,8840708382,70725667056,70725667056` TO rt_cases.
    APPEND `-3|K342696:598445|-3` TO rt_cases.
    APPEND `-1|K537617:7,K537009:5,K997072:10,K688385:7,K466270:2,K574921:10|0,0,0,0,0,-1` TO rt_cases.
    APPEND `-161485031543|K725780:7,K974637:7,K794435:5,K542393:3,K716022:5,K124807:0|-41866489659,-41866489659,-299046354`
        && `71,-17942781283,-29904635471,0` TO rt_cases.
    APPEND `904965251910|K526637:1,K323889:1,K315415:1,K568046:1,K710917:1|180993050382,180993050382,180993050382,18099305`
        && `0382,180993050382` TO rt_cases.
    APPEND `8|K223316:508747,K100344:573520,K827955:905432,K215883:0,K211991:0,K273764:527315,K354701:654579,K229586:16351`
        && `5,K230388:558054,K648337:511348|1,1,2,0,0,1,1,0,1,1` TO rt_cases.
    APPEND `-1|K406760:987308,K090752:223734,K722219:903247,K157002:953837|-1,0,0,0` TO rt_cases.
    APPEND `-12|K561090:0,K826010:2,K929031:9,K532162:6,K116523:6,K723465:0,K601681:5,K525130:9|0,-1,-3,-2,-2,0,-1,-3` TO rt_cases.
    APPEND `7|K526300:559976,K306666:728491,K110090:657818,K902731:0,K517023:315636,K236267:0|2,2,2,0,1,0` TO rt_cases.
    APPEND `6|K994841:1,K613728:1,K149781:1,K878963:1,K152968:1,K745247:1,K723865:1|0,1,1,1,1,1,1` TO rt_cases.
    APPEND `-237542986204|K214035:10,K550028:3,K348549:11,K990980:2,K629780:9,K780735:7,K412268:12|-43989441890,-131968325`
        && `67,-48388386078,-8797888378,-39590497701,-30792609323,-52787330267` TO rt_cases.
    APPEND `-772257555411|K217018:12,K180804:0,K568887:7,K563289:5,K174871:0,K122530:6,K427183:10,K804218:11,K497208:10,K9`
        && `05516:3,K733400:8,K826124:10|-113013300791,0,-65924425462,-47088875330,0,-56506650396,-94177750660,-1035955257`
        && `26,-94177750660,-28253325198,-75342200528,-94177750660` TO rt_cases.
    APPEND `-8|K557585:0,K874369:5,K192349:4,K772086:2,K626732:2,K712154:4,K856965:7,K560643:8|0,-1,-1,0,-1,-1,-2,-2` TO rt_cases.
    APPEND `-7|K272776:665545,K954475:262362,K952632:262710,K153711:387660,K775727:518364,K281472:751873,K246174:0,K493469`
        && `:96842,K240347:884833,K476661:710227,K805388:692578,K481090:866613,K559621:386068,K108083:38961|-1,0,0,0,-1,-1`
        && `,0,0,-1,-1,-1,-1,0,0` TO rt_cases.
    APPEND `3|K445837:1,K907881:1,K662795:1,K961427:1,K564457:1,K934289:1,K793265:1,K075505:1,K883685:1,K955730:1,K044955:`
        && `1|1,0,0,0,0,0,0,1,0,0,1` TO rt_cases.
    APPEND `6|K031040:1,K576374:1,K752616:1,K453718:1,K457744:1,K943318:1,K893860:1,K584703:1|1,1,1,1,1,0,0,1` TO rt_cases.
    APPEND `-17|K500195:0,K659440:77808,K353298:140549,K696622:95973,K276392:429586,K213725:751877,K376226:992657|0,0,-1,-`
        && `1,-3,-5,-7` TO rt_cases.
    APPEND `-324929262300|K533030:1,K351769:1,K968813:1,K067436:1|-81232315575,-81232315575,-81232315575,-81232315575` TO rt_cases.
    APPEND `12|K791448:1,K953952:1,K017652:1,K727643:1,K479748:1,K793433:1,K799160:1,K071129:1|1,1,2,2,2,1,1,2` TO rt_cases.
    APPEND `751137696257|K931837:1,K729930:1,K765125:1,K310787:1,K202718:1,K841242:1,K426647:1,K852534:1,K442236:1,K987845`
        && `:1,K036469:1,K392187:1,K505116:1,K112388:1|53652692589,53652692590,53652692590,53652692590,53652692590,5365269`
        && `2590,53652692590,53652692589,53652692590,53652692589,53652692590,53652692590,53652692590,53652692590` TO rt_cases.
    APPEND `-569455637475|K386334:1,K562778:1,K435618:1,K286829:1,K363374:1,K610299:1,K668597:1,K709776:1,K471000:1,K13207`
        && `1:1|-56945563748,-56945563747,-56945563748,-56945563748,-56945563748,-56945563747,-56945563747,-56945563747,-5`
        && `6945563747,-56945563748` TO rt_cases.
    APPEND `-12|K369427:0,K721913:91186,K379495:0,K101903:100684,K464351:122943,K470603:147293,K618966:753792,K941073:3160`
        && `84,K312905:60877,K843940:396146,K529014:869282,K893570:0|0,0,0,0,-1,-1,-3,-1,0,-2,-4,0` TO rt_cases.
    APPEND `316894214467|K165960:5,K554215:4,K096462:10,K177210:8,K554746:5,K147945:11,K377370:10,K584908:7,K131689:6,K428`
        && `027:0,K685627:1,K410469:0|23648821975,18919057580,47297643951,37838115160,23648821975,52027408346,47297643950,`
        && `33108350765,28378586370,0,4729764395,0` TO rt_cases.
    APPEND `-12|K868103:1,K346475:1,K372179:1,K938951:1|-3,-3,-3,-3` TO rt_cases.
    APPEND `-352698562180|K464866:1,K801773:1|-176349281090,-176349281090` TO rt_cases.
    APPEND `-909189226445|K531845:1,K105463:1,K811306:1,K843257:1,K705938:1,K709851:1,K777164:1,K295915:1,K866207:1,K03537`
        && `5:1,K641511:1|-82653566041,-82653566041,-82653566040,-82653566040,-82653566040,-82653566040,-82653566040,-8265`
        && `3566041,-82653566040,-82653566041,-82653566041` TO rt_cases.
    APPEND `2|K716980:1,K419282:1|1,1` TO rt_cases.
    APPEND `-610787885124|K506943:1,K925069:1,K888415:1,K499065:1,K191269:1,K236807:1,K631669:1,K202862:1,K634724:1,K57429`
        && `8:1,K712114:1|-55526171375,-55526171374,-55526171375,-55526171375,-55526171375,-55526171375,-55526171375,-5552`
        && `6171375,-55526171375,-55526171375,-55526171375` TO rt_cases.
    APPEND `30|K587080:1,K590146:1,K862292:1,K225864:1,K166512:1,K704300:1,K907179:1,K103850:1,K682347:1,K214494:1,K999251`
        && `:1,K341740:1,K543054:1,K464008:1|2,2,2,2,3,2,2,3,2,2,2,2,2,2` TO rt_cases.
    APPEND `2|K829327:1,K477092:0|2,0` TO rt_cases.
    APPEND `443390688757|K436792:1|443390688757` TO rt_cases.
    APPEND `-3|K142828:10,K258514:12,K142012:8|-1,-1,-1` TO rt_cases.
    APPEND `20419830602|K736907:11,K166197:11,K422695:9,K507217:0,K275479:5,K473308:4,K048710:9,K956531:9,K855642:11,K0365`
        && `63:1,K477519:4,K357650:3,K934915:11|2552478825,2552478825,2088391766,0,1160217648,928174119,2088391766,2088391`
        && `766,2552478825,232043530,928174118,696130589,2552478825` TO rt_cases.
    APPEND `-5|K102656:754888,K330827:763341|-2,-3` TO rt_cases.
    APPEND `-10|K397329:605164,K625271:563127,K210011:452736,K392138:782905,K317990:906696,K886718:334787,K334874:0|-2,-2,`
        && `-1,-2,-2,-1,0` TO rt_cases.
    APPEND `484814458630|K965979:1,K203773:1,K353111:1,K651868:1,K190696:1,K348735:1|80802409771,80802409772,80802409772,8`
        && `0802409771,80802409772,80802409772` TO rt_cases.
    APPEND `-77466022572|K518998:12|-77466022572` TO rt_cases.
    APPEND `-14|K537887:1,K925601:1,K023445:1,K934298:1,K916773:1,K905615:1,K909372:1,K741860:1,K266498:1,K050769:1,K13454`
        && `2:1|-1,-1,-2,-1,-1,-1,-1,-1,-1,-2,-2` TO rt_cases.
    APPEND `-8|K380850:52756,K450999:94818,K510512:152138,K448498:0|-1,-3,-4,0` TO rt_cases.
    APPEND `-4|K354721:0,K001819:3|0,-4` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_10.
    APPEND `-6|K323570:100712,K857898:841633,K431566:716154,K281961:970447|0,-2,-2,-2` TO rt_cases.
    APPEND `31|K751938:1,K153075:1,K481472:1,K422811:1,K390247:1,K681564:1,K684754:1,K234083:1,K750401:1,K209010:1,K987467`
        && `:1,K429304:1|2,3,3,3,3,2,2,3,2,3,2,3` TO rt_cases.
    APPEND `-9|K421541:562508,K521799:469892,K291445:804862,K027143:124542,K914182:591560,K349333:589184,K259082:581626,K2`
        && `49276:410004|-1,-1,-2,0,-2,-1,-1,-1` TO rt_cases.
    APPEND `1|K244679:749016,K265382:136305|1,0` TO rt_cases.
    APPEND `257150457436|K083134:1,K870875:1,K532817:1|85716819146,85716819145,85716819145` TO rt_cases.
    APPEND `29|K200640:10,K261762:12,K900247:11,K738995:10,K493440:9,K588201:9,K341434:2,K354289:1,K174442:1,K175094:0,K15`
        && `0947:9|4,5,4,4,4,3,1,0,0,0,4` TO rt_cases.
    APPEND `-3|K287196:1,K402899:1,K816625:1,K255192:1,K148902:1,K921272:1,K352272:1,K793669:1|-1,0,0,-1,-1,0,0,0` TO rt_cases.
    APPEND `-330064701689|K765158:1,K413132:1,K405143:1,K277595:1,K432207:1,K734657:1,K112538:1|-47152100241,-47152100241,`
        && `-47152100241,-47152100242,-47152100241,-47152100241,-47152100242` TO rt_cases.
    APPEND `-23|K656321:577185,K862285:18052,K638541:722657,K487874:872380,K116900:39754,K640088:855377,K408402:464771,K70`
        && `5346:373969,K722663:459110,K769311:929685,K212111:955297,K662065:743116,K110030:92153|-2,0,-2,-3,0,-3,-2,-1,-2`
        && `,-3,-3,-2,0` TO rt_cases.
    APPEND `-849432019278|K003896:1,K782681:1,K874254:1,K040903:1,K431240:1,K144418:1,K708955:1,K377947:1,K613980:1,K92764`
        && `4:1,K419697:1,K341256:1,K995907:1,K154876:1|-60673715663,-60673715662,-60673715662,-60673715663,-60673715663,-`
        && `60673715663,-60673715663,-60673715663,-60673715663,-60673715662,-60673715663,-60673715663,-60673715662,-606737`
        && `15663` TO rt_cases.
    APPEND `639534599368|K196831:1,K880163:1,K023573:1,K612150:1,K208846:1,K387970:1,K388963:1,K693364:1,K065753:1,K810816`
        && `:1,K652184:1|58139509034,58139509033,58139509034,58139509033,58139509034,58139509034,58139509033,58139509033,5`
        && `8139509034,58139509033,58139509033` TO rt_cases.
    APPEND `-713537786978|K204352:1,K256926:1,K356733:1,K494007:1,K452340:1|-142707557396,-142707557396,-142707557396,-142`
        && `707557395,-142707557395` TO rt_cases.
    APPEND `-8|K639383:858560,K706216:211700,K125961:23729,K103075:0,K583243:502428,K744327:970536,K462933:0,K251446:48037`
        && `1,K791868:17224,K895827:660403,K524072:0,K838233:898178|-1,0,0,0,-1,-2,0,-1,0,-1,0,-2` TO rt_cases.
    APPEND `957760430214|K472040:1,K366402:1|478880215107,478880215107` TO rt_cases.
    APPEND `-1|K408013:935306,K568592:0|-1,0` TO rt_cases.
    APPEND `455277295762|K701668:1,K363624:1,K040614:1|151759098587,151759098587,151759098588` TO rt_cases.
    APPEND `-8|K737777:0,K405640:174870,K025859:246078,K496967:327290,K357323:0,K707157:0,K254653:0,K391630:420228,K747259`
        && `:0,K830074:450163,K600453:184286,K222156:298391|0,-1,-1,-1,0,0,0,-1,0,-2,-1,-1` TO rt_cases.
    APPEND `1|K701270:1|1` TO rt_cases.
    APPEND `355028316750|K922340:1,K816231:1,K538711:1,K278962:1,K654681:1|71005663350,71005663350,71005663350,71005663350`
        && `,71005663350` TO rt_cases.
    APPEND `8|K532426:138449,K623340:593431,K574867:466629,K949415:887317,K844342:240188,K299301:373400,K867689:441671,K87`
        && `6372:0,K612278:514564|0,1,1,2,1,1,1,0,1` TO rt_cases.
    APPEND `3|K921297:1,K378756:1,K343274:1,K168042:1|0,1,1,1` TO rt_cases.
    APPEND `-27|K460902:876688,K254605:753852,K775165:509191,K921364:878068,K191638:230547,K975566:0,K551851:532781,K83078`
        && `9:0,K640043:0,K646514:785827|-5,-5,-3,-5,-1,0,-3,0,0,-5` TO rt_cases.
    APPEND `6|K191863:162625,K213218:108498,K759943:891740,K099481:520613|1,0,3,2` TO rt_cases.
    APPEND `-6|K489132:30062,K564173:852284,K559082:362846,K103318:746768|0,-3,-1,-2` TO rt_cases.
    APPEND `18|K741728:438096,K461357:558286,K997187:160540,K339916:0,K572440:0,K078419:0,K603802:522806|5,6,2,0,0,0,5` TO rt_cases.
    APPEND `36|K079770:1,K512963:1,K491416:1,K660263:1,K732156:1,K622429:1,K468025:1,K342366:1,K003136:1,K249317:1,K771823`
        && `:1,K972023:1,K043858:1,K853262:1|3,3,3,2,2,2,3,3,3,3,2,2,3,2` TO rt_cases.
    APPEND `852165472325|K992145:1,K513105:0|852165472325,0` TO rt_cases.
    APPEND `32|K792117:1,K916340:1,K768218:1,K270899:1,K365983:1,K772542:1,K941773:1,K236185:1,K404073:1,K541834:1,K979358`
        && `:1,K377294:1,K269470:1|2,2,2,3,3,2,2,3,3,2,2,3,3` TO rt_cases.
    APPEND `9|K343666:3,K646851:0,K212877:10,K930729:7|1,0,5,3` TO rt_cases.
    APPEND `-870574932473|K880367:1,K347486:1,K469208:1,K141531:1,K551266:1,K651688:1,K430709:1,K545640:1,K715131:1,K25068`
        && `1:1|-87057493247,-87057493248,-87057493247,-87057493248,-87057493247,-87057493247,-87057493247,-87057493247,-8`
        && `7057493247,-87057493248` TO rt_cases.
    APPEND `15|K921280:137320,K739349:207759,K865055:394465,K620133:475631,K280419:326376,K322372:822194,K254724:0,K444302`
        && `:0,K889774:0|1,1,3,3,2,5,0,0,0` TO rt_cases.
    APPEND `258545686201|K368237:1,K007379:1,K025110:1,K658412:1,K531544:1,K701843:1,K942489:1,K108801:1,K020699:1,K267323`
        && `:1,K747891:1|23504153291,23504153291,23504153291,23504153291,23504153291,23504153291,23504153291,23504153291,2`
        && `3504153291,23504153291,23504153291` TO rt_cases.
    APPEND `2|K833380:3,K431833:9,K688341:10,K736785:10,K265129:6,K145093:3,K155584:10,K287671:5|0,0,1,0,0,0,1,0` TO rt_cases.
    APPEND `116061418778|K651525:8,K044409:11,K922906:10,K148040:10,K788923:4,K697200:4,K277618:0,K580283:10,K906530:3,K98`
        && `6574:8,K137934:10,K679044:3,K200747:0|11462856176,15761427241,14328570219,14328570219,5731428088,5731428088,0,`
        && `14328570219,4298571066,11462856176,14328570220,4298571066,0` TO rt_cases.
    APPEND `-68407513538|K904216:11,K193763:12,K712492:9,K615727:11,K519217:12,K215875:8,K565050:0,K163495:0,K021973:10,K1`
        && `53502:4|-9772501934,-10660911201,-7995683400,-9772501934,-10660911201,-7107274134,0,0,-8884092667,-3553637067` TO rt_cases.
    APPEND `327129804211|K013858:1,K883037:1,K949293:1,K905275:1|81782451053,81782451053,81782451052,81782451053` TO rt_cases.
    APPEND `-32278358181|K915065:8,K687197:4,K167509:4|-16139179091,-8069589545,-8069589545` TO rt_cases.
    APPEND `12|K734556:910178,K417887:542203,K488743:516185,K518636:53467,K472760:776558|4,2,2,0,4` TO rt_cases.
    APPEND `11|K551455:3,K316781:9,K619608:9,K794858:0|1,5,5,0` TO rt_cases.
    APPEND `672092013476|K384502:1,K663883:1,K963205:1,K835097:1,K880528:1,K161489:1,K971391:1,K838425:1,K379772:1,K463202`
        && `:1,K610532:1,K697894:1,K294759:1|51699385652,51699385652,51699385652,51699385652,51699385652,51699385652,51699`
        && `385652,51699385652,51699385652,51699385652,51699385652,51699385652,51699385652` TO rt_cases.
    APPEND `-14|K909771:0,K417846:0,K207373:0,K361700:65162,K851122:964883,K085301:197482,K808417:749580,K946051:651854,K2`
        && `42351:725857|0,0,0,0,-4,-1,-3,-3,-3` TO rt_cases.
    APPEND `-2|K747743:1,K441974:1,K066954:1,K897392:1,K388402:1,K975482:1|0,0,-1,0,-1,0` TO rt_cases.
    APPEND `15|K784235:745523,K379675:824434,K260497:601853,K778856:311954,K722417:906442,K416896:64701,K093504:453764,K59`
        && `2146:950640,K813284:548103,K527479:424392,K471459:280319,K634622:458585|2,2,1,1,2,0,1,2,1,1,1,1` TO rt_cases.
    APPEND `-15|K557669:996578,K611920:718384,K327196:300698,K391535:229708,K770413:0,K694718:0,K696100:386806,K143529:154`
        && `672,K464526:67480,K290769:906562,K549842:298297,K741932:596022,K885817:714385,K680798:0|-3,-2,-1,-1,0,0,-1,0,0`
        && `,-2,-1,-2,-2,0` TO rt_cases.
    APPEND `16|K089081:6,K611816:9,K236008:3,K831009:3,K018397:1,K662941:1,K868265:10|3,4,1,1,1,1,5` TO rt_cases.
    APPEND `80033509539|K055112:1,K457373:1|40016754770,40016754769` TO rt_cases.
    APPEND `26|K615509:0,K861458:53852,K966685:0,K798445:977605,K389454:0,K075827:196690,K844858:366176,K246151:801541,K32`
        && `3455:266937|0,0,0,9,0,2,4,8,3` TO rt_cases.
    APPEND `-1|K537429:1,K658603:1,K655064:1,K237243:1,K847093:1,K918242:1,K940041:1,K533641:1|0,0,0,-1,0,0,0,0` TO rt_cases.
    APPEND `-4|K559121:1,K760431:1,K908228:1|-2,-1,-1` TO rt_cases.
    APPEND `29|K548276:1,K579334:1,K676547:1,K641547:1,K547784:1,K371063:1,K702695:1,K868231:1,K670903:1,K472925:1|3,3,3,3`
        && `,3,3,3,2,3,3` TO rt_cases.
    APPEND `-88491362415|K594609:1,K815293:1,K527748:1,K696478:1,K845473:1,K040287:1,K305482:1,K333131:1,K499190:1,K391371`
        && `:1,K003229:1,K835441:1,K710366:1,K023653:1|-6320811601,-6320811601,-6320811601,-6320811601,-6320811601,-632081`
        && `1601,-6320811601,-6320811601,-6320811601,-6320811601,-6320811602,-6320811601,-6320811601,-6320811601` TO rt_cases.
    APPEND `-22|K542450:8,K240171:12,K790561:9,K266449:10,K853003:8,K289475:11,K656830:6,K113135:12,K822937:10|-2,-3,-2,-3`
        && `,-2,-3,-1,-3,-3` TO rt_cases.
    APPEND `319166902450|K289216:1,K434464:1,K039790:1|106388967483,106388967483,106388967484` TO rt_cases.
    APPEND `-4|K073408:1,K055401:1|-2,-2` TO rt_cases.
    APPEND `-971096391612|K126687:1,K722548:1,K626757:1,K080347:1,K186761:1,K550701:1,K440492:1|-138728055945,-13872805594`
        && `4,-138728055944,-138728055945,-138728055945,-138728055944,-138728055945` TO rt_cases.
    APPEND `-844391157125|K513408:1,K586330:1,K875094:1,K312643:1,K253151:1,K389866:1,K534877:1,K780713:1,K868387:1,K06519`
        && `2:1,K072137:1,K509161:1,K396802:1|-64953165933,-64953165932,-64953165932,-64953165933,-64953165933,-6495316593`
        && `3,-64953165933,-64953165932,-64953165932,-64953165933,-64953165933,-64953165933,-64953165933` TO rt_cases.
    APPEND `519396311557|K954141:1,K457377:1,K729257:1,K152882:1,K896597:1,K347295:1,K855558:1,K214231:1,K250877:1|5771070`
        && `1284,57710701284,57710701284,57710701285,57710701284,57710701284,57710701284,57710701284,57710701284` TO rt_cases.
    APPEND `2|K515081:0,K169408:2,K732822:7,K020744:1,K624960:12,K890448:8,K300877:0,K230004:12,K577283:9,K243935:9|0,0,0,`
        && `0,1,0,0,1,0,0` TO rt_cases.
    APPEND `-2|K951791:8,K405389:11|-1,-1` TO rt_cases.
    APPEND `9|K262216:916408,K016088:499974,K496527:879360|4,2,3` TO rt_cases.
    APPEND `2|K717409:5,K657323:7,K628679:11,K240532:9,K209090:2,K545537:7,K009759:10,K424111:2,K354046:7|0,0,1,0,0,0,1,0,`
        && `0` TO rt_cases.
    APPEND `-783643473213|K844612:1,K069526:1,K147295:1,K794604:1,K387384:1,K950627:1,K137568:1|-111949067602,-11194906760`
        && `2,-111949067602,-111949067602,-111949067602,-111949067601,-111949067602` TO rt_cases.
    APPEND `-8|K755448:417016,K554960:142058,K241773:0,K267129:950926,K551222:180867|-2,-1,0,-4,-1` TO rt_cases.
    APPEND `-32679746593|K387804:2,K175008:9,K287919:4,K789366:12,K343994:2,K519080:4,K302643:6,K181761:0,K457463:10,K6137`
        && `85:1,K937214:12,K256023:12|-883236394,-3974563775,-1766472789,-5299418367,-883236394,-1766472789,-2649709183,0`
        && `,-4416181972,-441618197,-5299418366,-5299418367` TO rt_cases.
    APPEND `-19|K473878:780587,K698448:12123,K004038:0,K672969:0,K444172:0,K927957:239513,K087350:499921|-10,0,0,0,0,-3,-6` TO rt_cases.
    APPEND `-9|K789127:6,K878955:11,K950073:7,K916838:8,K965541:4,K071380:9,K383420:11,K097858:3,K008387:9,K106667:9,K3843`
        && `13:11,K498607:7|0,-1,-1,-1,0,-1,-1,0,-1,-1,-1,-1` TO rt_cases.
    APPEND `-14|K856609:540222,K994298:234922,K972317:212683,K065068:10112,K181976:0,K892712:0,K193165:103718|-7,-3,-3,0,0`
        && `,0,-1` TO rt_cases.
    APPEND `-3|K179320:1,K769312:1,K777350:1,K025387:1,K135745:1,K254631:1,K821163:1|-1,0,0,-1,-1,0,0` TO rt_cases.
    APPEND `175249676427|K650153:1,K796824:1,K463405:1,K607484:1,K849162:1,K523526:1,K875678:1,K234469:1,K155618:1|1947218`
        && `6270,19472186269,19472186270,19472186270,19472186269,19472186270,19472186269,19472186270,19472186270` TO rt_cases.
    APPEND `9|K465933:9,K348943:10,K357347:4,K240115:11,K241708:11,K260019:3,K411723:6|1,2,1,2,2,0,1` TO rt_cases.
    APPEND `-7|K231741:730397,K907891:0,K643926:101882|-6,0,-1` TO rt_cases.
    APPEND `220144661402|K014796:1,K111921:1,K316034:1,K969517:1,K828387:1|44028932281,44028932281,44028932280,44028932280`
        && `,44028932280` TO rt_cases.
    APPEND `-36|K453984:8,K619925:2,K461162:5,K032476:6,K052680:9,K350192:3,K467069:5,K894277:0,K289497:12,K007304:5,K7710`
        && `01:6,K067715:7,K090521:1,K637312:12|-4,-1,-2,-3,-4,-1,-2,0,-5,-2,-3,-3,-1,-5` TO rt_cases.
    APPEND `23666578726|K929205:1,K393181:1,K636554:1,K420488:1,K461197:1,K366778:1,K638451:1,K381557:1,K652398:1,K985139:`
        && `1,K134472:1,K847955:1,K648969:1|1820506055,1820506056,1820506056,1820506056,1820506056,1820506056,1820506056,1`
        && `820506056,1820506056,1820506055,1820506056,1820506056,1820506056` TO rt_cases.
    APPEND `27|K754735:1,K412078:1,K064294:1,K275385:1,K098349:1,K228011:1,K768536:1,K900872:1,K311793:1,K668020:1|2,3,3,3`
        && `,3,3,2,2,3,3` TO rt_cases.
    APPEND `4|K365829:134661,K419155:222620,K043551:830794,K399273:0,K873290:729731,K289674:0|0,0,2,0,2,0` TO rt_cases.
    APPEND `0|K884112:190659,K620107:871030|0,0` TO rt_cases.
    APPEND `21|K338883:563355,K192137:0,K397281:847889,K191721:0,K143383:857504,K067208:941894,K492378:839853,K855010:8950`
        && `22|2,0,4,0,4,4,3,4` TO rt_cases.
    APPEND `23|K187110:12,K340323:8,K417247:10,K397945:3,K947709:0,K681343:7,K020506:9,K072797:4,K102889:2,K821598:12,K154`
        && `546:10,K775213:10,K783383:1|3,2,3,1,0,2,2,1,0,3,3,3,0` TO rt_cases.
    APPEND `-9|K309701:0,K285817:160127,K675220:198106,K845074:990078,K707936:439282,K110105:81680,K179322:239939,K251585:`
        && `431598|0,-1,-1,-3,-2,0,-1,-1` TO rt_cases.
    APPEND `4|K511603:1,K469724:1|2,2` TO rt_cases.
    APPEND `-891375859383|K516784:9,K232042:9,K754363:9,K240738:11,K282066:11,K527283:1,K918751:1,K243334:0,K802404:1|-154`
        && `276591047,-154276591047,-154276591047,-188560277946,-188560277946,-17141843450,-17141843450,0,-17141843450` TO rt_cases.
    APPEND `-1|K120900:554652,K202350:0,K028930:397063,K414105:210068,K137749:0,K131904:460420,K260539:0,K021358:0,K878761`
        && `:728456,K158412:0|0,0,0,0,0,0,0,0,-1,0` TO rt_cases.
    APPEND `9|K756031:8,K328591:7,K615807:2,K843055:11,K534680:2,K023138:5,K848564:7,K952380:0,K084320:0,K253663:3,K649900`
        && `:0,K187824:0,K839263:12,K054029:2|1,1,0,2,0,1,1,0,0,1,0,0,2,0` TO rt_cases.
    APPEND `0|K480072:1|0` TO rt_cases.
    APPEND `28|K942412:1,K447993:1,K044855:1,K593433:1,K000295:1,K117450:1,K762501:1,K538154:1,K949860:1,K257166:1,K770269`
        && `:1,K765629:1,K518812:1,K311223:1|2,2,2,2,2,2,2,2,2,2,2,2,2,2` TO rt_cases.
    APPEND `-2|K451308:1,K623531:1|-1,-1` TO rt_cases.
    APPEND `-17|K127853:1,K887595:1,K897442:1,K224173:1,K895569:1,K404461:1|-3,-3,-2,-3,-3,-3` TO rt_cases.
    APPEND `-938111054699|K876922:3,K967033:8,K311514:2,K661089:8,K808205:2,K155658:6|-97045971176,-258789256469,-64697314`
        && `117,-258789256469,-64697314117,-194091942351` TO rt_cases.
    APPEND `-13|K857918:8,K990254:6,K404307:4,K178302:12,K196983:12,K393865:1,K018404:11|-2,-1,-1,-3,-3,0,-3` TO rt_cases.
    APPEND `0|K650665:812759|0` TO rt_cases.
    APPEND `-36069508535|K921266:4,K355049:0,K545535:1,K417524:4,K664831:0,K647464:7,K133093:10,K649829:12,K774556:6,K0222`
        && `19:9,K482940:2|-2623236984,0,-655809246,-2623236984,0,-4590664723,-6558092461,-7869710953,-3934855477,-5902283`
        && `215,-1311618492` TO rt_cases.
    APPEND `-928869194137|K409118:1,K059708:1,K864458:1,K982791:1,K336838:1,K458037:1,K467709:1|-132695599163,-13269559916`
        && `3,-132695599162,-132695599162,-132695599163,-132695599162,-132695599162` TO rt_cases.
    APPEND `19|K885608:1,K419884:1,K916993:1,K401558:1,K637958:1,K047588:1,K461856:1,K047891:1,K196226:1,K293775:1,K782394`
        && `:1,K318259:1|1,2,1,2,1,2,1,2,2,2,1,2` TO rt_cases.
    APPEND `938957158933|K814167:1,K326692:1,K562430:1|312985719644,312985719645,312985719644` TO rt_cases.
    APPEND `4|K476352:0,K294990:13654,K848071:671471,K411325:272125,K585458:991031,K287286:480580,K328404:902456|0,0,1,0,1`
        && `,1,1` TO rt_cases.
    APPEND `-4|K260820:463136,K978595:364069,K507690:744482|-1,-1,-2` TO rt_cases.
    APPEND `-367022984751|K474531:10,K725554:9,K878433:2,K834576:3,K369792:0,K889101:10,K238292:3,K770790:2,K562221:7,K741`
        && `341:2,K789634:12|-61170497458,-55053447713,-12234099492,-18351149237,0,-61170497458,-18351149238,-12234099492,`
        && `-42819348221,-12234099492,-73404596950` TO rt_cases.
    APPEND `510990117829|K394195:1|510990117829` TO rt_cases.
    APPEND `2|K889303:215110|2` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_11.
    APPEND `15|K698647:1,K947735:1,K104919:1,K236477:1,K969403:1,K024334:1|2,2,3,3,2,3` TO rt_cases.
    APPEND `21|K610999:1,K341861:1,K233005:1,K902450:1,K247930:1,K745379:1,K307223:1,K147723:1,K225245:1,K619032:1,K138710`
        && `:1|2,2,2,1,2,2,2,2,2,2,2` TO rt_cases.
    APPEND `-428475021592|K156522:1,K973615:1,K780276:1,K862451:1,K153673:1,K318138:1,K393505:1,K651160:1,K150951:1,K59959`
        && `7:1,K164239:1,K999381:1,K941521:1|-32959617046,-32959617045,-32959617045,-32959617045,-32959617046,-3295961704`
        && `6,-32959617046,-32959617045,-32959617046,-32959617046,-32959617046,-32959617045,-32959617045` TO rt_cases.
    APPEND `4|K033819:149564,K178088:787094,K860885:352114,K389666:72171,K357425:732710|0,2,1,0,1` TO rt_cases.
    APPEND `-15|K220172:0,K786805:4,K966583:2,K991149:0,K997827:10,K139618:9|0,-2,-1,0,-6,-6` TO rt_cases.
    APPEND `2|K466048:8,K002848:2|2,0` TO rt_cases.
    APPEND `-777868992111|K177395:1,K657449:1,K891237:1,K108625:1,K547021:1|-155573798422,-155573798422,-155573798422,-155`
        && `573798423,-155573798422` TO rt_cases.
    APPEND `-942532566217|K204527:1|-942532566217` TO rt_cases.
    APPEND `26|K463607:1,K123723:1,K812791:1,K203009:1,K719484:1,K339202:1,K935097:1,K701561:1,K305654:1,K461901:1|3,3,2,3`
        && `,2,3,2,2,3,3` TO rt_cases.
    APPEND `-17|K462349:819621,K840971:100400,K379056:97310,K915016:209125,K046678:0,K868966:735197,K414191:619374,K204438`
        && `:399745,K251481:604956|-4,0,0,-1,0,-4,-3,-2,-3` TO rt_cases.
    APPEND `43244018753|K082911:1,K192669:1,K104768:1,K162755:1,K408503:1,K872736:1,K664495:1|6177716965,6177716965,617771`
        && `6965,6177716965,6177716965,6177716964,6177716964` TO rt_cases.
    APPEND `-18|K116829:352787,K512069:0,K945163:0,K426831:65825,K312589:388212,K402720:264769,K682932:345073,K500557:8877`
        && `75|-3,0,0,0,-3,-2,-3,-7` TO rt_cases.
    APPEND `39|K757064:1,K741676:1,K242569:1,K146435:1,K295506:1,K210721:1,K369544:1,K474786:1,K198504:1,K237598:1,K550409`
        && `:1,K111095:1,K115002:1,K385369:1|2,2,3,3,3,3,3,3,3,3,2,3,3,3` TO rt_cases.
    APPEND `-27|K288198:0,K723498:295608,K433510:372326,K639501:0,K905193:303486,K701566:805293,K785696:616083,K088347:802`
        && `883,K855599:0,K293344:0,K673655:103657,K868426:636235,K820245:11569,K809663:916235|0,-2,-2,0,-2,-4,-3,-4,0,0,-`
        && `1,-4,0,-5` TO rt_cases.
    APPEND `-13|K511307:1,K431407:1,K924761:1,K889032:1,K185033:1,K492919:1,K825799:1,K433117:1,K550603:1,K539735:1,K59428`
        && `0:1|-1,-2,-1,-1,-2,-1,-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `-8|K238364:1,K335027:1,K794219:1,K391328:1,K143789:1,K829233:1,K281899:1,K792468:1,K847246:1,K260644:1,K103239`
        && `:1|-1,-1,0,-1,-1,0,-1,-1,0,-1,-1` TO rt_cases.
    APPEND `18|K671097:1,K337940:1,K743604:1,K057411:1,K416855:1,K426201:1,K311871:1,K316227:1,K329539:1,K286301:1,K871885`
        && `:1,K474408:1|1,2,1,2,1,1,2,2,2,2,1,1` TO rt_cases.
    APPEND `3|K760391:386078,K269608:214197,K640015:309883,K829942:196266,K441264:757939,K545647:191223,K474392:271854|1,0`
        && `,1,0,1,0,0` TO rt_cases.
    APPEND `-834518128073|K761107:8,K684818:9,K532954:1,K495514:12|-222538167486,-250355438422,-27817270936,-333807251229` TO rt_cases.
    APPEND `-7|K538089:310356,K501577:0,K957376:427234,K154167:823791,K420139:754031,K973399:38203,K821596:353330,K642406:`
        && `559204,K752640:550756,K931738:750592,K311246:547723,K433946:0,K407635:321512|0,0,-1,-1,-1,0,0,-1,-1,-1,-1,0,0` TO rt_cases.
    APPEND `-12|K395906:929466,K884320:667758,K173841:107891,K815699:866386,K871532:211509,K104191:0|-4,-3,0,-4,-1,0` TO rt_cases.
    APPEND `-636455726718|K467807:1,K210861:1,K301548:1,K407988:1,K405572:1,K698679:1,K095645:1,K257652:1|-79556965839,-79`
        && `556965840,-79556965840,-79556965840,-79556965840,-79556965839,-79556965840,-79556965840` TO rt_cases.
    APPEND `153065405427|K962818:1|153065405427` TO rt_cases.
    APPEND `-26|K096039:1,K775379:1,K965067:1,K454049:1,K227958:1,K939665:1,K942282:1,K363957:1,K353322:1,K593372:1,K00009`
        && `9:1,K009404:1,K443321:1,K134573:1|-2,-2,-1,-2,-2,-2,-1,-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `-623537164054|K211385:1,K296932:1,K405634:1,K445793:1,K332452:1,K089369:1,K586665:1,K560119:1,K474522:1|-69281`
        && `907117,-69281907117,-69281907117,-69281907117,-69281907117,-69281907118,-69281907117,-69281907117,-69281907117` TO rt_cases.
    APPEND `762401451654|K723666:4,K168859:4,K045705:4,K822373:4,K397108:10,K549551:9,K360918:5,K867222:0,K753089:6,K01867`
        && `6:7,K349757:4,K888825:10,K020778:0|45516504576,45516504576,45516504576,45516504576,113791261441,102412135297,5`
        && `6895630721,0,68274756865,79653883009,45516504576,113791261441,0` TO rt_cases.
    APPEND `789633037153|K743260:4,K821773:0|789633037153,0` TO rt_cases.
    APPEND `18|K417295:432608,K868377:74162,K520057:0,K410867:970987,K960796:873974,K888172:71693|3,1,0,7,6,1` TO rt_cases.
    APPEND `-13|K950897:0,K581534:92132,K747044:565245,K212334:382788,K251872:0,K216097:0,K418872:104747,K279504:0,K814711`
        && `:0,K760584:554238,K023453:926165|0,0,-3,-2,0,0,0,0,0,-3,-5` TO rt_cases.
    APPEND `14|K057192:484185,K019004:32130,K417807:271034,K936894:812886,K109210:0,K583709:976341,K155181:834843,K339293:`
        && `0|2,0,1,3,0,4,4,0` TO rt_cases.
    APPEND `-3|K852541:0,K615496:1|0,-3` TO rt_cases.
    APPEND `-731746573910|K684383:1,K200657:1,K274487:1,K190592:1|-182936643477,-182936643478,-182936643477,-182936643478` TO rt_cases.
    APPEND `-14|K389505:1,K413811:1,K078932:1,K121506:1,K201174:1|-3,-2,-3,-3,-3` TO rt_cases.
    APPEND `8|K143743:123370,K443848:4636,K005564:89227,K348847:654772,K556036:0,K106556:873036,K076825:211408,K550139:707`
        && `656,K747940:994793,K969308:222224,K360045:874306,K100083:902618,K910509:991003,K053191:0|0,0,0,1,0,1,0,1,1,1,1`
        && `,1,1,0` TO rt_cases.
    APPEND `14|K861476:6,K615979:1,K319628:3,K984919:12,K582706:4,K938733:3,K174432:8,K001299:2,K172055:4,K674860:0,K44284`
        && `5:7,K913836:3|2,0,1,3,1,1,2,0,1,0,2,1` TO rt_cases.
    APPEND `2|K556267:832922|2` TO rt_cases.
    APPEND `-86884895897|K125434:1,K454523:1,K679196:1,K133937:1,K155126:1,K492389:1,K763884:1|-12412127986,-12412127985,-`
        && `12412127985,-12412127986,-12412127985,-12412127985,-12412127985` TO rt_cases.
    APPEND `7|K222554:4,K419895:1,K866939:2,K571442:1,K464753:9,K197831:11|1,0,1,0,2,3` TO rt_cases.
    APPEND `19|K810331:68562,K935036:0,K999037:972947,K158699:989262,K719520:849038,K201921:328182,K209094:943195,K994533:`
        && `535975,K737308:342991|0,0,4,4,3,1,4,2,1` TO rt_cases.
    APPEND `68226265530|K973298:1|68226265530` TO rt_cases.
    APPEND `506067510431|K448599:1,K443053:1,K789794:1,K352418:1,K759014:1,K340375:1,K222578:1,K215196:1|63258438804,63258`
        && `438804,63258438803,63258438804,63258438804,63258438804,63258438804,63258438804` TO rt_cases.
    APPEND `85129472681|K810166:1,K460985:1,K908926:1,K313865:1,K060052:1,K328539:1,K002552:1|12161353240,12161353240,1216`
        && `1353240,12161353240,12161353240,12161353240,12161353241` TO rt_cases.
    APPEND `323323972214|K250048:2,K141430:10,K775317:5,K206956:2,K529122:11|21554931481,107774657405,53887328702,21554931`
        && `481,118552123145` TO rt_cases.
    APPEND `-871008059752|K512866:1,K066018:1,K378217:1,K857031:1,K789685:1,K240598:1,K406074:1,K917318:1|-108876007469,-1`
        && `08876007469,-108876007469,-108876007469,-108876007469,-108876007469,-108876007469,-108876007469` TO rt_cases.
    APPEND `1|K482887:1,K745944:1|1,0` TO rt_cases.
    APPEND `0|K894453:11,K463677:5,K492300:5,K622841:2,K254937:12,K025794:8,K293542:12,K230543:1,K647392:5,K300383:8,K2207`
        && `65:7,K590567:9,K790370:4|0,0,0,0,0,0,0,0,0,0,0,0,0` TO rt_cases.
    APPEND `3|K582776:1|3` TO rt_cases.
    APPEND `166013438744|K331668:6,K414541:10,K897024:4,K791084:11,K605074:5,K142602:11,K805616:1,K753486:8,K929610:8,K791`
        && `702:7|14029304683,23382174471,9352869788,25720391918,11691087235,25720391918,2338217447,18705739577,1870573957`
        && `7,16367522130` TO rt_cases.
    APPEND `0|K444108:1,K893348:1,K916482:1,K651537:1|0,0,0,0` TO rt_cases.
    APPEND `-1|K173256:235977,K648841:0,K072093:918989,K933194:0|0,0,-1,0` TO rt_cases.
    APPEND `-33|K475204:1,K816767:1,K300059:1,K878115:1,K183073:1,K064131:1,K329799:1,K413725:1,K686998:1,K654593:1,K98194`
        && `2:1,K315405:1|-3,-2,-3,-2,-3,-3,-3,-3,-3,-3,-2,-3` TO rt_cases.
    APPEND `-2|K171058:11,K754357:5,K394543:12,K308025:2,K174116:11,K091549:9,K474458:4|-1,0,-1,0,0,0,0` TO rt_cases.
    APPEND `9|K910888:0,K466667:952056,K200240:0,K649894:0,K164474:468426,K723755:478286,K121304:0,K635113:125514,K994041:`
        && `637382,K016046:804971|0,3,0,0,1,1,0,0,2,2` TO rt_cases.
    APPEND `-149553907753|K587245:1,K646851:1,K068370:1,K286450:1,K159098:1,K699479:1,K532490:1,K043962:1,K170754:1,K57751`
        && `8:1,K077037:1,K156558:1,K444380:1,K832909:1|-10682421982,-10682421982,-10682421983,-10682421982,-10682421983,-`
        && `10682421982,-10682421982,-10682421983,-10682421982,-10682421982,-10682421983,-10682421983,-10682421982,-106824`
        && `21982` TO rt_cases.
    APPEND `-8|K207727:1,K004456:1,K431601:1,K028867:1,K162461:1,K070048:1,K161552:1,K957886:1,K339459:1,K646073:1,K713020`
        && `:1,K602966:1|-1,-1,-1,-1,-1,-1,-1,0,-1,0,0,0` TO rt_cases.
    APPEND `-1|K442632:803057,K874503:296236,K682692:637989,K658614:0,K902725:260052,K208804:450922,K842348:978410,K992965`
        && `:587567|0,0,0,0,0,0,-1,0` TO rt_cases.
    APPEND `-4|K544431:0,K124646:861127|0,-4` TO rt_cases.
    APPEND `-5|K317168:364594,K435838:988880,K438340:589494,K807828:252348|-1,-2,-1,-1` TO rt_cases.
    APPEND `-374875326453|K643382:1,K510505:1,K303341:1,K146288:1,K985282:1|-74975065290,-74975065291,-74975065291,-749750`
        && `65291,-74975065290` TO rt_cases.
    APPEND `-493980483023|K549436:8,K120880:0,K609632:2,K459814:6,K806260:7,K305933:5,K164776:10,K083168:12,K715396:4,K073`
        && `192:3,K765188:9,K506336:6,K651133:1|-54134847455,0,-13533711864,-40601135591,-47367991523,-33834279659,-676685`
        && `59318,-81202271182,-27067423727,-20300567795,-60901703386,-40601135591,-6766855932` TO rt_cases.
    APPEND `-27|K946357:380038,K184958:0,K889702:94298,K962801:203959,K378711:0,K370162:809383,K707126:655255,K850967:1071`
        && `89,K924703:388125,K442886:12504,K217646:592897,K205561:70809|-3,0,-1,-2,0,-7,-5,-1,-3,0,-5,0` TO rt_cases.
    APPEND `3|K395112:12,K597953:7,K665716:3|2,1,0` TO rt_cases.
    APPEND `74244240006|K268145:7,K840211:4,K726264:0|47246334549,26997905457,0` TO rt_cases.
    APPEND `58344568667|K348153:1|58344568667` TO rt_cases.
    APPEND `19|K890768:1,K977826:1,K746273:1,K769600:1,K177587:1,K080643:1,K458504:1,K270122:1,K377792:1,K081386:1,K334155`
        && `:1,K068026:1,K967259:1,K174351:1|1,1,1,1,2,2,1,1,1,2,1,2,1,2` TO rt_cases.
    APPEND `-254854798590|K150268:2,K449873:3,K431333:0,K363670:2,K791580:9,K431643:5,K546540:6,K461289:12,K473181:12,K121`
        && `937:2,K847868:4,K150039:6,K106644:9,K442848:5|-6619605158,-9929407737,0,-6619605158,-29788223212,-16549012896,`
        && `-19858815475,-39717630949,-39717630949,-6619605158,-13239210316,-19858815475,-29788223212,-16549012895` TO rt_cases.
    APPEND `-8637631364|K439444:1,K498340:1,K949834:1,K439844:1,K827941:1,K470567:1,K676708:1|-1233947338,-1233947338,-123`
        && `3947337,-1233947338,-1233947337,-1233947338,-1233947338` TO rt_cases.
    APPEND `-8|K208036:662179,K913824:343515,K148724:0|-5,-3,0` TO rt_cases.
    APPEND `-519552905273|K652778:6,K475663:10,K248856:10,K632095:4|-103910581054,-173184301758,-173184301758,-69273720703` TO rt_cases.
    APPEND `35|K083122:11,K566724:12,K384080:2,K580498:7,K672986:11,K233814:2,K550689:11,K585898:9,K129487:6,K083174:1,K26`
        && `0932:5,K748977:9|5,5,1,3,4,1,4,4,2,0,2,4` TO rt_cases.
    APPEND `-12|K674634:5,K844738:1,K630251:8,K341587:1,K805812:7,K536321:2,K452161:3|-2,0,-4,-1,-3,-1,-1` TO rt_cases.
    APPEND `-650584633115|K933752:1,K997740:1,K448657:1,K918106:1,K772257:1,K137708:1,K900525:1,K229762:1,K764764:1,K57676`
        && `7:1,K938567:1|-59144057556,-59144057555,-59144057556,-59144057556,-59144057556,-59144057556,-59144057556,-5914`
        && `4057556,-59144057556,-59144057556,-59144057556` TO rt_cases.
    APPEND `2|K489257:932294|2` TO rt_cases.
    APPEND `-2|K884712:9,K500164:11,K800073:9,K278929:0,K302853:11,K987965:5,K455516:2,K222776:5,K934934:3,K140424:1|0,-1,`
        && `0,0,-1,0,0,0,0,0` TO rt_cases.
    APPEND `-11|K664566:964497,K079508:0,K525537:879980,K018218:692186|-4,0,-4,-3` TO rt_cases.
    APPEND `-785660841424|K223023:8,K925017:0,K032824:0,K911412:8,K139337:2,K451239:2,K627062:6,K421190:0,K025323:3,K94960`
        && `4:10,K626552:6|-139673038475,0,0,-139673038475,-34918259619,-34918259619,-104754778857,0,-52377389428,-1745912`
        && `98094,-104754778857` TO rt_cases.
    APPEND `-6|K015199:844831,K211899:301634|-4,-2` TO rt_cases.
    APPEND `-223586326921|K201219:2,K642402:12,K671793:1,K152302:3,K476732:10,K795685:2,K227793:0|-14905755128,-8943453076`
        && `9,-7452877564,-22358632692,-74528775640,-14905755128,0` TO rt_cases.
    APPEND `10|K557553:0,K154385:580817,K823624:117919,K860390:825852|0,4,1,5` TO rt_cases.
    APPEND `17|K671940:1,K430780:1,K827833:1,K181911:1,K403198:1,K291621:1,K208429:1,K978723:1,K693059:1,K111976:1,K568799`
        && `:1,K486111:1,K917536:1|1,1,1,2,1,2,2,1,1,2,1,1,1` TO rt_cases.
    APPEND `13|K191377:924972,K807145:0,K341444:20373,K087119:0,K695034:281165,K782063:608665,K595655:493617,K352797:40213`
        && `7,K281361:403381,K844996:994|4,0,0,0,1,2,2,2,2,0` TO rt_cases.
    APPEND `-8|K364182:0,K117199:0,K892391:322726,K122103:502090,K863047:603457,K287859:14690,K478349:0,K052352:134123,K95`
        && `9442:0,K284970:863545|0,0,-1,-2,-2,0,0,0,0,-3` TO rt_cases.
    APPEND `-131764026990|K620638:3,K247555:4,K052500:1,K243735:0,K399403:8,K391024:2,K784703:4,K838581:9,K219215:11,K9417`
        && `62:5,K115773:12,K093352:9,K112508:10|-5067847192,-6757129589,-1689282397,0,-13514259178,-3378564795,-675712958`
        && `9,-15203541576,-18582106370,-8446411987,-20271388768,-15203541576,-16892823973` TO rt_cases.
    APPEND `-2|K036735:7,K565830:7,K194179:0|-1,-1,0` TO rt_cases.
    APPEND `-26|K259346:433071,K699637:679502,K190415:124601,K494793:183727,K793263:330857,K725339:55714,K415769:45292,K41`
        && `4247:0,K909434:424194,K767505:698482|-4,-6,-1,-2,-3,0,0,0,-4,-6` TO rt_cases.
    APPEND `2|K545915:0,K178750:286526|0,2` TO rt_cases.
    APPEND `-1|K079271:0,K052007:301812|0,-1` TO rt_cases.
    APPEND `-595597780540|K311554:1,K291705:1,K046756:1,K969051:1,K581610:1,K612649:1|-99266296757,-99266296757,-992662967`
        && `57,-99266296756,-99266296757,-99266296756` TO rt_cases.
    APPEND `-596899497221|K642198:1,K821588:1|-298449748611,-298449748610` TO rt_cases.
    APPEND `-181596501379|K029980:1,K050279:1,K606669:1,K440238:1,K223636:1,K367464:1,K305035:1,K146312:1,K910204:1,K70726`
        && `8:1,K178516:1|-16508772853,-16508772853,-16508772852,-16508772852,-16508772853,-16508772853,-16508772853,-1650`
        && `8772853,-16508772852,-16508772852,-16508772853` TO rt_cases.
    APPEND `8|K659090:190918,K352165:984324,K052859:0,K210775:502994,K993265:12224,K286620:695887,K752172:722973,K792804:5`
        && `09915,K200101:436402,K851148:498313,K160092:0,K363444:654680,K416182:0|0,1,0,1,0,1,1,1,1,1,0,1,0` TO rt_cases.
    APPEND `-28|K199132:8,K203205:1,K293886:6,K817786:6,K557981:2,K097050:6,K743390:12,K874955:1,K639965:12,K797319:9,K552`
        && `814:1,K260097:8,K609911:5|-3,-1,-2,-2,-1,-2,-4,0,-4,-3,-1,-3,-2` TO rt_cases.
    APPEND `-713194135623|K508062:2,K457461:11,K119799:8,K706343:11,K639220:6,K980248:4,K987078:4|-31008440679,-1705464237`
        && `36,-124033762717,-170546423736,-93025322038,-62016881359,-62016881358` TO rt_cases.
    APPEND `40603813532|K384977:1,K047947:1,K750290:1,K891491:1,K983673:1,K591548:1,K412422:1,K181992:1|5075476692,5075476`
        && `692,5075476691,5075476691,5075476691,5075476691,5075476692,5075476692` TO rt_cases.
    APPEND `4|K528961:785882,K364258:0|4,0` TO rt_cases.
    APPEND `-2|K026299:320006,K472071:588109,K507677:0,K161450:463660,K330319:792468,K745229:249245,K990485:0,K518791:6293`
        && `6,K645107:0,K325085:713030,K763299:733279|0,0,0,0,-1,0,0,0,0,0,-1` TO rt_cases.
    APPEND `-9|K664678:694446,K839365:394645,K773968:0,K633083:342486,K191294:432631,K067590:940206,K463715:98152|-2,-1,0,`
        && `-1,-2,-3,0` TO rt_cases.
    APPEND `33|K688986:1,K092785:1,K299523:1,K496075:1,K848450:1,K101566:1,K577835:1,K568792:1,K136715:1,K452505:1,K197389`
        && `:1,K528346:1,K797399:1,K275080:1|2,3,2,2,2,3,2,2,3,2,3,2,2,3` TO rt_cases.
    APPEND `9|K710708:375986,K825959:0,K439374:766577|3,0,6` TO rt_cases.
    APPEND `13|K750945:307168,K586460:980017,K656296:949217,K552024:112077,K174635:279791|1,5,5,1,1` TO rt_cases.
  ENDMETHOD.

  METHOD split_cases_12.
    APPEND `-22|K358205:0,K216425:0,K247059:676359,K793192:264406,K713542:808242,K537646:652419,K524932:928149,K436739:502`
        && `065|0,0,-4,-1,-5,-4,-5,-3` TO rt_cases.
    APPEND `23|K183184:9,K751520:10,K929062:5,K080361:12,K050709:1,K084933:4,K704630:7,K660774:4,K725049:11,K832411:0,K730`
        && `590:3|3,4,2,4,0,1,3,1,4,0,1` TO rt_cases.
    APPEND `-961534628321|K866257:1,K919044:1,K184164:1,K892139:1|-240383657080,-240383657080,-240383657081,-240383657080` TO rt_cases.
    APPEND `-12|K914743:1,K134351:1,K116479:1,K119735:1,K655716:1,K994842:1,K230447:1,K335237:1,K384157:1,K800531:1,K63410`
        && `1:1,K687701:1,K795035:1,K106625:1|0,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1` TO rt_cases.
    APPEND `381643144430|K194420:3,K695710:10,K814931:12,K937729:8,K273344:1,K237024:1,K086151:8,K241016:8,K128239:8,K8853`
        && `73:11,K598636:8,K868913:5|13794330522,45981101738,55177322086,36784881391,4598110174,4598110174,36784881391,36`
        && `784881391,36784881391,50579211912,36784881391,22990550869` TO rt_cases.
    APPEND `-211210663316|K881532:1,K744036:1,K666181:1,K632776:1,K378127:1,K753443:1,K590697:1,K075736:1,K218162:1,K83974`
        && `1:1,K863582:1|-19200969392,-19200969392,-19200969392,-19200969392,-19200969393,-19200969392,-19200969393,-1920`
        && `0969393,-19200969393,-19200969392,-19200969392` TO rt_cases.
    APPEND `20|K820606:1,K710014:1,K818362:1,K122676:1,K123942:1,K213021:1,K928095:1,K159408:1,K540386:1,K930923:1,K890421`
        && `:1,K828522:1,K365876:1|1,2,1,2,2,2,1,2,2,1,1,1,2` TO rt_cases.
    APPEND `-2|K997041:1,K599529:1,K873715:1,K454265:1|0,-1,0,-1` TO rt_cases.
    APPEND `-772168715116|K885346:2,K337429:11,K472549:8,K925299:7,K091434:4,K488234:5,K717250:4|-37666766591,-20716721625`
        && `1,-150667066364,-131833683069,-75333533182,-94166916477,-75333533182` TO rt_cases.
    APPEND `692507903115|K599290:10,K679765:6,K498566:5,K495438:11,K557938:5|187164298139,112298578883,93582149070,2058807`
        && `27953,93582149070` TO rt_cases.
    APPEND `0|K404112:8,K081430:11|0,0` TO rt_cases.
    APPEND `743598487088|K904962:1,K797000:1,K997641:1,K222645:1,K497452:1,K126734:1,K173617:1,K303793:1,K170966:1,K071226`
        && `:1,K304324:1|67599862462,67599862462,67599862462,67599862463,67599862462,67599862463,67599862463,67599862463,6`
        && `7599862463,67599862463,67599862462` TO rt_cases.
    APPEND `3|K734413:0,K959093:441488,K128024:81202,K973570:525314|0,1,0,2` TO rt_cases.
    APPEND `-357170035037|K974027:1,K952120:1,K074143:1,K901969:1,K994320:1,K383147:1,K932024:1,K518783:1,K830998:1,K67586`
        && `1:1,K915705:1,K005643:1,K236112:1|-27474618079,-27474618079,-27474618080,-27474618080,-27474618079,-2747461808`
        && `0,-27474618080,-27474618080,-27474618080,-27474618080,-27474618080,-27474618080,-27474618080` TO rt_cases.
    APPEND `0|K890387:0,K977345:283883,K528014:316920,K852002:0,K471746:148296|0,0,0,0,0` TO rt_cases.
    APPEND `-306308205653|K416436:1|-306308205653` TO rt_cases.
    APPEND `-11|K375573:1,K233641:1,K402030:1,K760147:1,K073450:1,K791061:1,K816950:1,K762842:1|-2,-2,-1,-1,-2,-1,-1,-1` TO rt_cases.
    APPEND `-13|K353133:7,K379383:9,K485872:5,K261878:8,K294730:10,K242517:10,K708186:7|-2,-2,-1,-2,-2,-2,-2` TO rt_cases.
    APPEND `23|K786159:3,K904436:5,K009847:2,K399857:8,K669772:6,K701430:11,K720450:2,K637401:8,K364568:8,K784257:8|1,2,1,`
        && `3,2,4,1,3,3,3` TO rt_cases.
    APPEND `4|K246288:1,K259393:1,K937471:1,K328971:1|1,1,1,1` TO rt_cases.
    APPEND `-36|K109655:217916,K863837:8973,K884101:551074,K938521:816143,K244739:0,K607899:692977,K800682:806961,K625550:`
        && `917940,K564991:0,K872583:53127,K190288:921662,K236669:496968,K215985:462936|-1,0,-3,-5,0,-4,-5,-6,0,0,-6,-3,-3` TO rt_cases.
    APPEND `9|K413172:0,K637085:817065,K367225:154367,K028687:0,K572929:452831,K795625:0,K845764:0,K707865:875739,K463998:`
        && `916728|0,2,0,0,1,0,0,3,3` TO rt_cases.
    APPEND `251400809695|K315689:1,K957064:1,K192117:1,K877717:1,K667321:1,K955726:1|41900134949,41900134949,41900134950,4`
        && `1900134949,41900134949,41900134949` TO rt_cases.
    APPEND `17|K321420:928682,K420139:16748,K047093:459578,K872374:980424,K295331:457770,K932490:54738,K677860:137979|5,0,`
        && `3,5,3,0,1` TO rt_cases.
    APPEND `-761193575240|K258191:1,K741249:1,K346353:1,K668028:1,K468228:1,K403080:1,K424944:1,K417379:1,K181134:1,K53730`
        && `3:1,K415066:1,K545495:1,K443266:1|-58553351942,-58553351941,-58553351942,-58553351941,-58553351941,-5855335194`
        && `2,-58553351942,-58553351942,-58553351942,-58553351941,-58553351942,-58553351941,-58553351941` TO rt_cases.
    APPEND `-44124683702|K334242:7,K827158:11,K962803:9,K752782:6,K211766:9,K930817:7,K485269:5,K203491:2,K158943:6,K03358`
        && `3:2|-4826137280,-7583930011,-6205033645,-4136689097,-6205033646,-4826137280,-3447240914,-1378896366,-413668909`
        && `7,-1378896366` TO rt_cases.
    APPEND `-8|K480181:21276,K720884:864912,K214910:437505,K899192:818811,K760516:0,K810303:259765,K231025:809,K239952:787`
        && `97,K050705:884487,K271107:540838,K850145:0,K467029:158109,K524638:161895,K692365:114365|0,-2,-1,-2,0,0,0,0,-2,`
        && `-1,0,0,0,0` TO rt_cases.
    APPEND `-3|K608191:208873,K366870:0,K267305:64727,K777602:0,K224719:385898,K198630:293552,K907916:78261,K520445:779837`
        && `,K661113:650574|0,0,0,0,-1,0,0,-1,-1` TO rt_cases.
    APPEND `-497441863327|K121862:1,K657436:1,K985886:1,K079123:1,K019048:1|-99488372665,-99488372665,-99488372665,-994883`
        && `72666,-99488372666` TO rt_cases.
    APPEND `-25|K083178:608298,K504936:209388,K896264:577488,K036951:994455,K125654:0,K322327:224925,K237231:595818,K48162`
        && `7:43462,K006773:891665,K190213:892221,K655283:342108|-3,-1,-3,-5,0,-1,-3,0,-4,-4,-1` TO rt_cases.
    APPEND `-24|K077055:1,K126528:1,K049636:1,K524916:1,K987143:1,K496151:1,K807589:1,K503770:1|-3,-3,-3,-3,-3,-3,-3,-3` TO rt_cases.
    APPEND `3|K768214:487077,K773988:0,K281690:737792|1,0,2` TO rt_cases.
    APPEND `229641399061|K577253:1,K877544:1,K099367:1,K186370:1,K775696:1,K677228:1,K274164:1,K879962:1,K899832:1,K291879`
        && `:1,K456412:1,K153450:1|19136783255,19136783255,19136783256,19136783255,19136783255,19136783255,19136783255,191`
        && `36783255,19136783255,19136783255,19136783255,19136783255` TO rt_cases.
    APPEND `559924501269|K238684:10,K496180:10,K714401:1,K649597:7,K055211:8,K556204:3,K291805:8,K719121:3,K267643:7,K7196`
        && `07:4,K013468:3,K826087:3,K370296:9|73674276483,73674276483,7367427648,51571993538,58939421186,22102282945,5893`
        && `9421186,22102282945,51571993538,29469710593,22102282945,22102282945,66306848834` TO rt_cases.
    APPEND `836572075732|K832419:1|836572075732` TO rt_cases.
    APPEND `-21|K713872:62745,K869199:645744,K055629:0,K598661:189878,K609886:532898,K258979:626963,K259031:674537,K837600`
        && `:433670,K692989:974798,K984980:305412|0,-3,0,-1,-3,-3,-3,-2,-5,-1` TO rt_cases.
    APPEND `-33|K360448:1,K738913:1,K456054:1,K170119:1,K100912:1,K061363:1,K883465:1,K820598:1,K028446:1,K236521:1,K59037`
        && `7:1,K617738:1|-3,-2,-3,-3,-3,-3,-2,-2,-3,-3,-3,-3` TO rt_cases.
    APPEND `-8|K559697:1,K686621:1,K583508:1,K442085:1,K798954:1,K953672:1,K146570:1,K873406:1,K192194:1,K380123:1,K550914`
        && `:1|-1,-1,-1,-1,0,0,-1,0,-1,-1,-1` TO rt_cases.
    APPEND `-17|K708333:1,K498267:1,K565045:1,K305776:1,K525491:1,K296470:1,K722589:1,K005958:1,K072489:1,K752648:1,K54040`
        && `2:1,K004102:1,K760854:1|-1,-1,-1,-1,-1,-2,-1,-2,-2,-1,-1,-2,-1` TO rt_cases.
    APPEND `530081936762|K542603:1,K349227:1,K469778:1,K639327:1,K864741:1,K539901:1,K228579:1,K849026:1,K722570:1,K032974`
        && `:1,K720538:1,K427063:1,K644156:1|40775533597,40775533597,40775533597,40775533597,40775533597,40775533597,40775`
        && `533597,40775533597,40775533597,40775533598,40775533597,40775533597,40775533597` TO rt_cases.
    APPEND `-19|K504889:1,K546045:1,K497258:1,K636535:1,K284338:1,K147725:1,K684333:1,K288546:1,K216008:1|-2,-2,-2,-2,-2,-`
        && `3,-2,-2,-2` TO rt_cases.
    APPEND `-22|K122965:715806,K181960:844070,K966758:803794,K987571:500597,K015569:17920,K840093:538515,K989521:118062,K9`
        && `05383:0,K729901:684550,K020498:423668,K062577:873581,K607882:828595|-3,-3,-3,-2,0,-2,0,0,-2,-1,-3,-3` TO rt_cases.
    APPEND `2|K354255:1|2` TO rt_cases.
    APPEND `-8|K960782:1,K558125:1,K805357:1,K713030:1|-2,-2,-2,-2` TO rt_cases.
    APPEND `3|K375340:14412,K372264:525480,K306248:982243,K377260:143298,K281924:972631,K400346:780163,K545091:0,K681847:6`
        && `48582,K396028:491165,K949006:654647,K595921:937907|0,0,1,0,1,0,0,0,0,0,1` TO rt_cases.
    APPEND `851122178101|K500407:1,K270322:4|170224435620,680897742481` TO rt_cases.
    APPEND `-776312411194|K393986:11,K959635:9,K297492:3,K860982:9,K399916:9,K371567:8,K838741:1,K653999:8,K216228:9,K7140`
        && `49:5,K111583:1,K164668:0,K543749:12|-100463959096,-82197784715,-27399261571,-82197784715,-82197784715,-7306469`
        && `7524,-9133087190,-73064697524,-82197784715,-45665435953,-9133087190,0,-109597046286` TO rt_cases.
    APPEND `-6|K796504:1,K090862:1|-3,-3` TO rt_cases.
    APPEND `22|K294733:12,K126801:1,K740303:8,K275325:8,K170320:5,K375154:6,K765889:0,K406195:2,K423889:3,K694612:8,K71716`
        && `0:3,K346504:12,K917174:3,K106700:2|4,0,2,2,1,2,0,1,1,2,1,4,1,1` TO rt_cases.
    APPEND `-26|K718219:961374,K603104:165342,K213037:0,K164238:862011,K940572:852087,K874019:5804,K351318:0,K225109:0,K17`
        && `3204:985702,K360553:0,K311413:199796,K974878:526475|-5,-1,0,-5,-5,0,0,0,-6,0,-1,-3` TO rt_cases.
    APPEND `-10|K390824:634662,K510409:62296,K933279:408190,K978128:700743,K466418:846649,K510922:722901,K429121:0,K674040`
        && `:460513,K736899:751573,K925089:0,K441007:0|-1,0,-1,-1,-2,-2,0,-1,-2,0,0` TO rt_cases.
    APPEND `-9|K907384:1,K585239:1,K081711:1,K988892:1,K637538:1,K359906:1,K857797:1,K872032:1,K627846:1,K020133:1,K959649`
        && `:1,K887264:1,K163473:1,K210743:1|0,-1,-1,0,-1,-1,-1,0,-1,-1,0,0,-1,-1` TO rt_cases.
    APPEND `-2|K780504:0,K393024:136680,K536239:0,K325835:30690,K059696:844244,K652460:235393,K787046:570145,K824246:0,K22`
        && `6049:237542,K899596:456534,K583088:0,K652244:847378|0,0,0,0,-1,0,0,0,0,0,0,-1` TO rt_cases.
    APPEND `483867794445|K131326:11,K013775:1,K846032:8,K738202:10,K724687:3,K529843:12,K517577:10,K620874:3,K006481:1,K87`
        && `3389:1,K648555:4|83164777170,7560434288,60483474306,75604342882,22681302865,90725211458,75604342882,2268130286`
        && `5,7560434288,7560434288,30241737153` TO rt_cases.
    APPEND `868350744625|K775781:6,K184232:10,K280918:3|274216024619,457026707697,137108012309` TO rt_cases.
    APPEND `2|K014263:0,K209074:102060,K762823:746781,K255107:233052,K430571:580654,K926124:826044,K284359:864157|0,0,0,0,`
        && `0,1,1` TO rt_cases.
    APPEND `-10|K405266:1,K332583:1,K643163:1,K340293:1,K633407:1|-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `-878304518737|K349457:1,K826481:1,K841680:1,K740785:1,K792080:1,K733554:1|-146384086457,-146384086456,-1463840`
        && `86456,-146384086456,-146384086456,-146384086456` TO rt_cases.
    APPEND `-15|K014522:0,K852695:0,K068819:753287,K183287:209618,K575652:243404,K999223:835104,K825177:809901|0,0,-4,-1,-`
        && `1,-5,-4` TO rt_cases.
    APPEND `-860282228512|K202147:1|-860282228512` TO rt_cases.
    APPEND `888162585223|K399349:1,K132070:1,K800600:1,K082538:1,K185463:1,K651787:1,K169583:1,K760073:1,K424506:1|9868473`
        && `1691,98684731692,98684731691,98684731692,98684731692,98684731691,98684731692,98684731691,98684731691` TO rt_cases.
    APPEND `-2|K634864:538848|-2` TO rt_cases.
    APPEND `11|K660877:171128,K716367:721062,K862288:648661,K061553:397323|1,4,4,2` TO rt_cases.
    APPEND `773338598876|K122957:1,K504042:1,K687803:1,K065337:1,K669979:1,K343505:1,K631917:1,K802603:1,K927402:1,K957109`
        && `:1,K285392:1,K324287:1|64444883240,64444883240,64444883239,64444883240,64444883240,64444883240,64444883240,644`
        && `44883239,64444883239,64444883239,64444883240,64444883240` TO rt_cases.
    APPEND `-6|K059889:1,K977816:1,K860897:1|-2,-2,-2` TO rt_cases.
    APPEND `9|K673587:1,K359882:1,K738593:1,K344066:1,K355558:1,K863754:1,K903574:1,K111353:1,K790647:1,K010573:1|1,1,1,1,`
        && `1,1,0,1,1,1` TO rt_cases.
    APPEND `18|K885832:57557,K088636:777107,K569653:0,K519286:586950,K773240:912,K137074:757484,K561705:0,K596405:415129,K`
        && `260292:596,K458779:56390|1,5,0,4,0,5,0,3,0,0` TO rt_cases.
    APPEND `18|K409850:8,K475648:9,K676435:8,K684074:6,K552196:4,K471814:12,K052121:11,K020814:5,K061253:0,K362718:3|2,3,2`
        && `,2,1,3,3,1,0,1` TO rt_cases.
    APPEND `46590846901|K047620:3,K693930:4,K432440:12,K238438:9,K190986:1,K717051:1,K475570:3,K717024:9,K109985:5,K728140`
        && `:1|2911927931,3882570575,11647711725,8735783794,970642644,970642644,2911927931,8735783794,4853213219,970642644` TO rt_cases.
    APPEND `-1|K407851:370868,K513467:376146|0,-1` TO rt_cases.
    APPEND `-17|K759137:819798,K885711:599854,K572259:697184,K240585:743593,K680494:682747,K669793:0,K757992:224558,K08557`
        && `8:745046|-3,-2,-3,-3,-2,0,-1,-3` TO rt_cases.
    APPEND `-2|K194839:2|-2` TO rt_cases.
    APPEND `-11|K820788:158295,K816806:104118,K677201:422102,K364974:841984,K321830:277534,K936591:580313,K452050:456859,K`
        && `299589:388356,K167583:927868,K793752:121053|-1,0,-1,-2,-1,-2,-1,-1,-2,0` TO rt_cases.
    APPEND `5|K967076:3,K626553:12|1,4` TO rt_cases.
    APPEND `-16|K758329:0,K231132:591722,K123499:295840,K770331:716317,K179403:921530,K188130:947322,K014068:0,K110769:598`
        && `348,K453330:715234|0,-2,-1,-3,-3,-3,0,-2,-2` TO rt_cases.
    APPEND `56911232251|K147500:0,K388389:1,K170782:5,K013204:7,K700743:12,K686656:3,K301735:12,K904686:3,K467552:5,K27694`
        && `9:5,K462682:2,K428255:8,K173703:5|0,836929886,4184649430,5858509202,10043158633,2510789658,10043158633,2510789`
        && `658,4184649430,4184649430,1673859772,6695439089,4184649430` TO rt_cases.
    APPEND `5|K870040:301663,K779977:473610,K674679:889816,K200995:112628|1,1,3,0` TO rt_cases.
    APPEND `27|K525697:0,K237586:153003,K161967:443897,K596271:623685,K183827:885595,K472250:550335,K062652:0,K430676:3869`
        && `14,K235814:0,K951047:386887,K238858:583578,K160299:835296|0,1,2,4,5,3,0,2,0,2,3,5` TO rt_cases.
    APPEND `-12|K340445:691054,K163567:650109,K810840:385115,K095292:805769,K214066:0,K362293:545827,K750029:0,K952725:961`
        && `190,K127279:201938,K623993:973908,K070287:648921,K995134:51128,K436801:416069|-1,-1,-1,-2,0,-1,0,-2,0,-2,-1,0,`
        && `-1` TO rt_cases.
    APPEND `3|K644678:0,K114257:3,K614087:5,K021202:11,K531689:9,K044978:9,K488753:10,K433065:10,K702363:4|0,0,0,1,0,0,1,1`
        && `,0` TO rt_cases.
    APPEND `-1|K806600:407980|-1` TO rt_cases.
    APPEND `-873386392875|K015744:6,K827598:9|-349354557150,-524031835725` TO rt_cases.
    APPEND `-323176840164|K000228:1,K687106:1,K660462:1,K959178:1|-80794210041,-80794210041,-80794210041,-80794210041` TO rt_cases.
    APPEND `-491283302329|K943161:8,K892841:11,K495388:2|-187155543744,-257338872649,-46788885936` TO rt_cases.
    APPEND `33|K679722:0,K356952:11,K853111:1,K160237:6,K006835:12,K621665:6,K768435:1,K334561:4,K495507:7,K535418:3,K9410`
        && `84:9|0,6,0,3,7,3,1,2,4,2,5` TO rt_cases.
    APPEND `-929716822372|K129276:1|-929716822372` TO rt_cases.
    APPEND `9|K403668:0,K711370:85038,K013494:0,K762165:0|0,9,0,0` TO rt_cases.
    APPEND `15|K552166:302401,K343051:792861,K394685:310013,K974421:0,K021291:0,K132729:197083,K299192:399742,K420789:3895`
        && `92,K780588:500382|1,4,2,0,0,1,2,2,3` TO rt_cases.
    APPEND `-215179363621|K361494:7,K485090:8,K771569:6,K459679:8,K570877:2,K267652:8,K594173:0,K588799:7,K825402:9,K20025`
        && `8:10|-23173162236,-26483613984,-19862710488,-26483613984,-6620903496,-26483613984,0,-23173162236,-29794065732,`
        && `-33104517481` TO rt_cases.
    APPEND `687143721383|K406397:1,K453093:1,K684646:1,K319049:1,K324132:1,K638048:1,K954264:1,K267246:1,K433087:1,K362283`
        && `:1,K564036:1,K290618:1,K224365:1|52857209337,52857209337,52857209337,52857209337,52857209337,52857209337,52857`
        && `209337,52857209338,52857209337,52857209337,52857209337,52857209337,52857209338` TO rt_cases.
    APPEND `-357887914124|K559548:3,K966714:1,K346946:4,K326970:1,K906058:6,K016284:10,K674453:1,K699049:0,K910661:12,K643`
        && `407:10|-22367994633,-7455998211,-29823992844,-7455998211,-44735989265,-74559982109,-7455998211,0,-89471978531,`
        && `-74559982109` TO rt_cases.
    APPEND `-21|K556553:0,K532455:5,K658132:1,K275741:0,K120248:10,K090087:1,K296552:10,K089510:7,K171346:0,K164371:12,K10`
        && `6658:6,K482420:11,K308609:11|0,-2,0,0,-3,0,-3,-2,0,-3,-2,-3,-3` TO rt_cases.
    APPEND `-3|K770814:0,K917796:0,K623897:849151,K226368:492092,K037854:686157,K794623:0,K328277:590403,K052630:886062|0,`
        && `0,-1,0,-1,0,0,-1` TO rt_cases.
    APPEND `-14|K588662:1,K350019:1,K272293:1,K404146:1,K402186:1,K265565:1,K282979:1|-2,-2,-2,-2,-2,-2,-2` TO rt_cases.
    APPEND `-235759360445|K149938:1,K257991:1,K497653:1,K990521:1,K654436:1|-47151872089,-47151872089,-47151872089,-471518`
        && `72089,-47151872089` TO rt_cases.
    APPEND `25|K102843:0,K705463:521689,K971838:31666,K299962:373038,K599385:80921,K233661:755921,K409019:491563,K440366:5`
        && `51324,K239130:658351,K766690:629523,K893695:114627,K296195:299931|0,3,0,2,0,4,3,3,4,3,1,2` TO rt_cases.
    APPEND `3|K305194:3,K539714:9,K315519:0,K042299:6|1,1,0,1` TO rt_cases.
    APPEND `-23|K508359:73418,K772531:981970,K338332:0,K839316:845479,K531110:403784,K546995:757204,K388593:0,K719647:0,K7`
        && `85373:767709,K993762:738947|0,-5,0,-4,-2,-4,0,0,-4,-4` TO rt_cases.
    APPEND `-2|K549928:1|-2` TO rt_cases.
    APPEND `-767341565072|K130114:1,K170780:1|-383670782536,-383670782536` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_01.
    APPEND `14071337|L729523:0:,L070657:333913:,L807899:4851591:,L672817:4955161:|OK:0,463343,6732139,6875855` TO rt_cases.
    APPEND `6275787|L681394:1182605:,L508405:1912287:X,L912096:2908347:,L868760:4360332:X|OK:916,1912287,2252,4360332` TO rt_cases.
    APPEND `16683072|L239962:234943:X,L493357:3475709:X,L369340:3209808:,L646110:261764:,L261509:4413857:,L762347:3562785:`
        && `,L542469:4137504:,L508457:3829782:,L555446:1694877:,L766294:2434978:X,L085709:2439036:X|OK:234943,3475709,1231`
        && `353,100418,1693253,1366763,1587238,1469189,650192,2434978,2439036` TO rt_cases.
    APPEND `7165710|L382069:2711501:,L308273:3999440:X,L570602:1478476:,L549442:1126084:,L199580:942034:X,L121280:4376841:`
        && `,L143967:2611603:|OK:490147,3999440,267258,203558,942034,791184,472089` TO rt_cases.
    APPEND `27867744|L449368:1281279:,L056825:2728980:,L873277:0:X,L466346:4918881:X,L013698:1960134:,L975203:276154:X,L50`
        && `6420:1775961:,L779298:4173454:,L471202:49991:X,L010456:4183689:,L369360:1662876:X|OK:1667675,3551961,0,4918881`
        && `,2551253,276154,2311539,5432046,49991,5445368,1662876` TO rt_cases.
    APPEND `33575001|L711574:279016:,L810621:1668643:,L008964:0:,L869920:1367816:,L036487:3575759:,L836289:3890077:,L90008`
        && `8:2528204:,L359358:4848331:,L880267:4597677:,L818600:1330124:,L019594:0:|OK:388944,2326061,0,1906713,4984550,5`
        && `422704,3524276,6758495,6409087,1854171,0` TO rt_cases.
    APPEND `13257287|L207727:951750:X,L445938:4112655:,L819473:1218844:X,L479804:3253622:,L040115:0:,L610774:309449:,L7675`
        && `93:2054083:,L373594:2316822:X,L011467:2001320:|OK:951750,3074508,1218844,2432319,0,231336,1535576,2316822,1496`
        && `132` TO rt_cases.
    APPEND `8094523|L463540:3671595:,L280851:838128:X,L749234:3831695:,L297718:3888540:X,L088693:1988059:,L808493:0:|OK:13`
        && `02808,838128,1359616,3888540,705431,0` TO rt_cases.
    APPEND `24964185|L626832:2864839:,L274744:0:,L105146:4129805:X,L659132:2288070:,L908623:2735604:,L583415:4340782:,L367`
        && `220:3123336:,L494850:4168598:,L697008:4150344:,L027615:672437:,L780654:4836357:X,L195972:2034499:X|OK:1643248,`
        && `0,4129805,1312418,1569120,2489837,1791520,2391074,2380603,385704,4836357,2034499` TO rt_cases.
    APPEND `15083556|L868521:174625:,L492037:1173441:,L608536:2339832:,L104941:2074427:,L493435:0:,L035899:4992163:,L09015`
        && `6:901995:|OK:225966,1518439,3027756,2684320,0,6459888,1167187` TO rt_cases.
    APPEND `7786404|L646230:655873:X,L581244:1537982:,L078098:4623534:,L106870:0:,L903516:0:X,L341018:3576570:,L758008:331`
        && `856:|OK:655873,1089046,3273927,0,0,2532571,234987` TO rt_cases.
    APPEND `5568634|L027949:4028362:,L627262:1055275:,L052142:1590264:,L154490:1535631:|OK:2732491,715807,1078697,1041639` TO rt_cases.
    APPEND `19762542|L181310:4321224:,L954097:1294979:,L345707:4253242:,L982424:1867610:X,L326190:1321616:,L889327:4278716`
        && `:X,L972794:0:,L627300:4406562:,L002601:0:|OK:3772288,1130474,3712941,1867610,1153728,4278716,0,3846785,0` TO rt_cases.
    APPEND `4837100|L817230:836537:X,L235847:3155807:,L073225:962573:,L477125:429077:|OK:836537,2776278,846810,377475` TO rt_cases.
    APPEND `11292734|L848386:0:,L554539:938874:,L373877:466159:,L894114:4383734:,L102038:4213474:,L665229:1004763:X|OK:0,9`
        && `65694,479476,4508962,4333839,1004763` TO rt_cases.
    APPEND `18182097|L434068:1346848:,L671153:2966525:,L868704:4316552:X,L890855:2978941:,L983069:4758150:,L188158:3419587`
        && `:|OK:1207157,2658846,4316552,2669975,4264649,3064918` TO rt_cases.
    APPEND `10408822|L677547:3863872:X,L893343:0:,L653465:4758133:,L382017:1808707:|OK:3863872,0,4742272,1802678` TO rt_cases.
    APPEND `248762|L373686:1600462:X,L067237:2512855:,L536902:2298572:,L138188:1750667:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `6770726|L896831:0:,L340799:3003717:X,L920490:3392546:X,L083399:1880104:,L415652:137062:|OK:0,3003717,3392546,3`
        && `49019,25444` TO rt_cases.
    APPEND `23108589|L025841:1533347:,L819516:211034:,L442967:0:X,L590645:4256365:X,L813213:1898125:,L593526:206264:,L9670`
        && `39:50511:,L718572:3548596:,L997350:4450386:,L757687:1442248:,L155098:0:|OK:2166859,298224,0,4256365,2682347,29`
        && `1483,71380,5014720,6289090,2038121,0` TO rt_cases.
    APPEND `15704049|L184883:53596:,L941234:1168891:X,L643260:112423:,L554204:4950859:,L066112:3095560:,L913785:2893367:,L`
        && `226875:4565115:,L557935:1448116:X,L231249:2428542:X,L359032:651133:|OK:34999,1168891,73414,3232971,2021438,188`
        && `9404,2981076,1448116,2428542,425198` TO rt_cases.
    APPEND `3957411|L635127:2944692:,L698888:0:|OK:3957411,0` TO rt_cases.
    APPEND `11002190|L461394:776649:,L605677:4027647:,L986076:4272245:,L499688:1884973:,L569857:1514461:X,L178709:2844144:`
        && `|OK:533740,2767939,2936036,1295419,1514461,1954595` TO rt_cases.
    APPEND `10482504|L080941:1497449:,L366476:4648550:,L913633:4821824:,L058515:1349294:|OK:1274406,3956157,4103622,114831`
        && `9` TO rt_cases.
    APPEND `8204547|L916834:95477:,L203503:4180553:,L456495:4148954:,L859984:2365286:X,L685668:16428:,L515979:3670902:|OK:`
        && `46029,2015415,2000181,2365286,7920,1769716` TO rt_cases.
    APPEND `5182218|L222020:2342728:,L777417:2936815:,L132286:0:,L240885:2906200:|OK:1483131,1859234,0,1839853` TO rt_cases.
    APPEND `17430747|L011282:613530:,L706447:2197165:,L888556:0:,L823926:4168311:,L301766:1859540:,L155097:3073589:,L85816`
        && `5:0:|OK:897764,3215060,0,6099391,2721021,4497511,0` TO rt_cases.
    APPEND `28581304|L749433:4899588:,L885020:2988638:,L337477:4889783:,L374711:2909275:X,L186587:4974232:X,L026197:200677`
        && `6:,L589973:3410213:X|OK:5729000,3494561,5717536,2909275,4974232,2346487,3410213` TO rt_cases.
    APPEND `16843627|L804379:442656:,L778026:1509572:X,L483490:3951147:,L254113:2464192:,L631951:3537115:|OK:652971,150957`
        && `2,5828424,3634984,5217676` TO rt_cases.
    APPEND `14000249|L323709:218717:X,L363670:3901411:,L568836:2935772:,L529505:1566389:,L645038:2435394:X|OK:218717,52675`
        && `16,3963752,2114870,2435394` TO rt_cases.
    APPEND `39398498|L682938:3726140:X,L646535:1411894:,L798563:4612513:X,L743462:1143138:,L986340:1796375:,L438175:692899`
        && `:,L784111:659490:,L342182:656735:,L713929:4154519:,L204612:4575972:,L847273:2587101:,L878182:1721892:X|OK:3726`
        && `140,2343127,4612513,1897109,2981197,1149909,1094465,1089893,6894685,7594112,4293456,1721892` TO rt_cases.
    APPEND `6973684|L114326:4769473:,L546955:114045:,L738313:0:,L964447:4281739:,L280993:844853:,L399695:0:|OK:3322720,794`
        && `51,0,2982934,588579,0` TO rt_cases.
    APPEND `11350715|L206864:2017527:X,L132232:4052216:,L782410:3652799:,L778586:4087457:X|OK:2017527,2758831,2486900,4087`
        && `457` TO rt_cases.
    APPEND `5643102|L201185:3866349:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `7612930|L374912:2661737:,L186010:102772:X,L185148:4772377:,L222223:4043453:,L495522:823896:|OK:1625015,102772,`
        && `2913581,2468566,502996` TO rt_cases.
    APPEND `2368486|L327320:0:X,L859574:927193:,L392141:0:,L821595:1059931:|OK:0,1105137,0,1263349` TO rt_cases.
    APPEND `4134222|L348893:1568335:,L079639:3474282:,L394241:53431:|OK:1272328,2818547,43347` TO rt_cases.
    APPEND `1|L640390:0:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `13649325|L170998:4502893:X,L017961:3474684:,L926232:2214932:|OK:4502893,5585783,3560649` TO rt_cases.
    APPEND `2925380|L964230:0:,L245365:3251016:|OK:0,2925380` TO rt_cases.
    APPEND `29180271|L130722:190023:X,L435134:3180546:,L218659:2325660:,L892083:1778426:,L138756:4818685:X,L764156:799938:`
        && `X,L973540:4776618:,L380746:1175614:X,L507064:800293:,L934185:460782:,L933034:0:|OK:190023,5299033,3874727,2962`
        && `994,4818685,799938,7958210,1175614,1333349,767698,0` TO rt_cases.
    APPEND `8334931|L499422:138115:,L651823:4581971:,L404157:2617635:,L930770:1929899:X,L153239:726774:|OK:109694,3639121,`
        && `2078994,1929899,577223` TO rt_cases.
    APPEND `16834105|L370804:3471663:,L618778:3541695:,L712301:49774:,L554524:4900225:,L156685:1179860:,L168891:2817801:,L`
        && `978707:410959:,L538880:1750768:,L239080:2243124:X|OK:2795105,2851489,40074,3945268,949929,2268667,330871,14095`
        && `78,2243124` TO rt_cases.
    APPEND `31195170|L539842:0:,L049275:1464716:,L008811:2863408:X,L809454:3975098:,L332073:2927250:X,L050435:0:,L477849:5`
        && `60744:X,L496389:1113551:,L778927:0:X,L805778:4609443:,L121206:2331097:,L043266:4447174:|OK:0,2028254,2863408,5`
        && `504486,2927250,0,560744,1541981,0,6382890,3227968,6158189` TO rt_cases.
    APPEND `12245762|L997663:3277798:X,L144518:295726:,L947495:237301:,L532869:3525288:X,L327669:4017613:,L987334:647137:,`
        && `L495304:3320138:|OK:3277798,188959,151628,3525288,2567127,413500,2121462` TO rt_cases.
    APPEND `12607300|L722491:2325156:,L622719:1287049:X,L437508:589777:X,L340582:459317:,L182352:3838236:,L421046:0:,L6983`
        && `33:2159629:,L249711:0:,L542593:4672405:,L425966:0:X|OK:1854367,1287049,589777,366316,3061083,0,1722355,0,37263`
        && `53,0` TO rt_cases.
    APPEND `18430261|L777711:1163750:,L155188:1430240:,L026463:938407:,L588794:1368926:,L279228:4086389:,L122923:0:,L61446`
        && `4:0:,L760695:0:,L819468:4877111:,L476677:1614347:,L341890:720733:|OK:1323972,1627151,1067604,1557396,4648992,0`
        && `,0,0,5548578,1836606,819962` TO rt_cases.
    APPEND `19947428|L433706:4485794:X,L961059:313271:,L262731:3399155:X,L024083:2716357:,L926889:2117994:,L501428:3260932`
        && `:X|OK:4485794,535639,3399155,4644503,3621405,3260932` TO rt_cases.
    APPEND `9401023|L127761:4797859:X,L798341:4027479:,L637983:0:,L686566:3269927:X|OK:4797859,1333237,0,3269927` TO rt_cases.
    APPEND `4089647|L055786:4760206:|OK:4089647` TO rt_cases.
    APPEND `24091486|L467030:4595870:X,L977889:4999533:,L882137:2971104:,L083160:3558912:,L887496:1505545:,L763467:2636592`
        && `:X,L213932:0:,L988223:3848404:,L221237:743154:X,L434303:4294058:,L929083:2937496:,L376406:1820466:|OK:4595870,`
        && `3106621,1846191,2211445,935519,2636592,0,2391330,743154,2668251,1825308,1131205` TO rt_cases.
    APPEND `920081|L666788:1977054:|OK:920081` TO rt_cases.
    APPEND `18164595|L962887:4014025:,L662541:434244:,L006069:3434603:X,L131914:4285515:,L609755:1257171:,L040213:739051:,`
        && `L182945:4908064:,L861874:4481410:,L384193:2429163:,L627363:44985:,L917524:331605:,L788646:3330177:|OK:2251976,`
        && `243623,3434603,2404289,705307,414627,2753556,2514192,1362826,25238,186039,1868319` TO rt_cases.
    APPEND `26595187|L791230:4721239:X,L271843:270541:,L365996:823925:X,L664477:1266895:,L788146:2428669:X,L206389:4555708`
        && `:,L162708:1703146:,L359797:3768760:,L306069:3111726:,L587526:4545230:X,L337748:1504601:,L963056:992874:|OK:472`
        && `1239,221737,823925,1038355,2428669,3733887,1395909,3088899,2550390,4545230,1233181,813766` TO rt_cases.
    APPEND `40732940|L404982:380575:,L856460:0:,L525833:3980222:,L794950:4495926:,L503332:170636:X,L059650:3565117:X,L3236`
        && `89:3379896:,L758111:4965767:,L982258:3482160:X,L348056:311588:,L561407:2152291:,L747804:939093:|OK:619013,0,64`
        && `73911,7312714,170636,3565117,5497468,8076919,3482160,506804,3500744,1527454` TO rt_cases.
    APPEND `1169200|L400939:885176:|OK:1169200` TO rt_cases.
    APPEND `16776031|L444551:677758:,L790758:4072890:,L339098:1744870:X,L499492:3457652:X,L735311:2791931:X,L567527:499983`
        && `2:,L470466:2119931:,L589614:3503479:X,L959210:2385484:X,L180532:2611814:X,L514260:4585179:|OK:11565,69501,1744`
        && `870,3457652,2791931,85318,36175,3503479,2385484,2611814,78242` TO rt_cases.
    APPEND `19219951|L069379:3986939:,L097403:17161:,L178528:1891364:,L339618:3154381:,L423758:2685778:,L111297:3559641:,L`
        && `664749:2947631:|OK:4200472,18080,1992662,3323324,2829623,3750289,3105501` TO rt_cases.
    APPEND `5832406|L087126:2281367:X,L740515:556908:,L837233:2035937:,L387884:4752956:,L146394:4342319:,L220407:202680:X,`
        && `L709938:4574364:,L890738:4278390:|OK:2281367,90781,331877,774777,707840,202680,745665,697419` TO rt_cases.
    APPEND `13656487|L164155:2428425:,L903430:1386188:,L751539:0:X,L532577:4996781:X,L060593:3839925:|OK:2747318,1568217,0`
        && `,4996781,4344171` TO rt_cases.
    APPEND `899888|L795979:1517937:|OK:899888` TO rt_cases.
    APPEND `6389653|L447430:2296715:X,L553392:9517:X,L183969:1850610:,L849950:2689929:X|OK:2296715,9517,1393492,2689929` TO rt_cases.
    APPEND `5159239|L004484:3491449:,L608677:0:,L735117:3203657:,L863107:2849669:|OK:1887234,0,1731673,1540332` TO rt_cases.
    APPEND `10676825|L642273:2122357:X,L180931:937407:,L028151:229250:,L931348:796859:,L484194:0:,L743082:4289855:|OK:2122`
        && `357,1282351,313609,1090085,0,5868423` TO rt_cases.
    APPEND `1478387|L491704:1499058:|OK:1478387` TO rt_cases.
    APPEND `18446494|L876961:3637781:X,L472340:4805197:,L919854:1300384:,L344785:3860064:X,L628411:1912759:X,L222713:13233`
        && `18:,L386620:1970174:,L070782:3127849:,L059000:4862113:,L274765:1502529:,L726505:727340:|OK:3637781,2213132,598`
        && `919,3860064,1912759,609481,907404,1440595,2239346,692021,334992` TO rt_cases.
    APPEND `11391308|L916391:1339156:X,L579837:4608893:,L185560:2390503:X,L447203:2289853:|OK:1339156,5118571,2390503,2543`
        && `078` TO rt_cases.
    APPEND `3626096|L993215:25174:X,L820971:4084599:,L187917:0:X|OK:25174,3600922,0` TO rt_cases.
    APPEND `2858190|L609480:3253107:X,L642690:1855658:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `8180079|L157233:308105:X,L176156:1454476:X,L551157:4536760:,L533399:0:|OK:308105,1454476,6417498,0` TO rt_cases.
    APPEND `4053821|L589478:2244779:,L148565:0:,L670296:0:,L188545:1692400:X,L635558:497469:|OK:1933038,0,0,1692400,428383` TO rt_cases.
    APPEND `22942701|L973005:2193108:,L107667:3981726:,L481143:1899449:,L367013:0:X,L921681:4099520:X,L518554:4244916:|OK:`
        && `3354531,6090362,2905356,0,4099520,6492932` TO rt_cases.
    APPEND `13714263|L829079:1397635:,L273475:4033485:X,L223693:4311543:X|OK:5369235,4033485,4311543` TO rt_cases.
    APPEND `9588966|L535743:3767813:,L282150:2615522:,L431902:4991245:,L791946:0:|OK:3176331,2204930,4207705,0` TO rt_cases.
    APPEND `18465039|L318907:1648490:,L315890:1563552:,L235997:3662291:X,L051804:4557165:,L856575:4216229:,L201350:195767:`
        && `,L611168:2883995:|OK:1619772,1536313,3662291,4477775,4142778,192357,2833753` TO rt_cases.
    APPEND `32245433|L266571:412973:,L081748:1261179:,L194946:1221486:X,L259415:290341:,L462377:3946146:,L908252:4290881:,`
        && `L910368:408895:,L085297:1023651:,L863677:3100356:,L764945:1384334:,L968199:325569:,L795781:4667548:|OK:606865,`
        && `1853305,1221486,426657,5798871,6305460,600872,1504258,4555980,2034282,478424,6858973` TO rt_cases.
    APPEND `15305723|L384079:2321521:,L503666:649389:X,L792703:2399008:,L771726:3101127:,L491107:189776:,L692966:4750096:,`
        && `L443498:4129232:X,L179568:833573:,L286552:1386189:|OK:1631294,649389,1685743,2179110,133352,3337813,4129232,58`
        && `5738,974052` TO rt_cases.
    APPEND `24136094|L625042:0:,L519740:4654558:,L410270:1254732:X,L923283:4534050:,L633711:1768460:,L883962:765635:,L4205`
        && `30:4955637:X|OK:0,7117499,1254732,6933225,2704233,1170768,4955637` TO rt_cases.
    APPEND `28821352|L772610:4428376:,L640304:4655504:X,L129733:1469089:,L592699:491372:,L239010:2254582:,L490914:62375:,L`
        && `852930:4640508:,L842661:0:,L734606:2522523:|OK:6743755,4655504,2237203,748286,3433391,94988,7066800,0,3841425` TO rt_cases.
    APPEND `5268493|L717167:709787:X,L054144:2166960:,L209711:2325262:|OK:709787,2199031,2359675` TO rt_cases.
    APPEND `3128235|L821173:1038290:,L606001:4332275:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `34754560|L722900:4089096:,L020833:1139494:X,L863930:1822604:,L454778:4499350:,L659832:0:,L849645:0:X,L423809:1`
        && `547552:X,L407328:233530:,L839966:4702798:,L700109:1261338:,L472457:4381234:,L891785:4339428:|OK:5176880,113949`
        && `4,2307454,5696270,0,0,1547552,295654,5953839,1596880,5546732,5493805` TO rt_cases.
    APPEND `12756574|L236172:4370498:X,L363793:1584204:,L198046:1082865:,L022194:4002146:X,L288282:4490323:,L636221:478295`
        && `3:|OK:4370498,581645,397577,4002146,1648634,1756074` TO rt_cases.
    APPEND `9934566|L056064:4124388:X,L388179:228661:,L876864:262266:,L142212:3527475:,L516437:4508577:,L410107:3171373:,L`
        && `675988:260834:|OK:4124388,111091,127418,1713767,2190420,1540760,126722` TO rt_cases.
    APPEND `13053976|L199333:1396177:,L471343:3466453:,L184277:3308682:,L799427:706389:X,L670067:3289677:,L044743:1190396:`
        && `X|OK:1359169,3374567,3220978,706389,3202477,1190396` TO rt_cases.
    APPEND `9643413|L952582:2863227:X,L393901:162310:X,L057957:2011783:X,L460914:0:,L774538:1473189:,L724168:925320:|OK:28`
        && `63227,162310,2011783,0,2829110,1776983` TO rt_cases.
    APPEND `8986378|L827950:4406933:,L834357:1275646:,L586887:1215438:,L317954:0:X,L126163:1609806:X|OK:4712667,1364145,12`
        && `99760,0,1609806` TO rt_cases.
    APPEND `16859865|L857432:3600848:,L615628:0:,L528597:548715:,L492943:3423469:,L180303:4633340:,L169217:2731214:,L88905`
        && `1:4816961:,L477900:4751136:,L128619:4918982:X,L359361:4378260:X,L226804:4951981:,L401457:2336588:|OK:856502,0,`
        && `130518,814311,1102092,649650,1145769,1130112,4918982,4378260,1177885,555784` TO rt_cases.
    APPEND `3698737|L709210:823734:,L131541:1642518:,L642622:470674:,L759668:0:,L874723:3297772:,L574771:4125165:,L291355:`
        && `163650:,L981693:0:,L025245:2863334:,L602744:3585276:,L595932:3603690:|OK:148076,295261,84609,0,592812,741546,2`
        && `9418,0,514717,644494,647804` TO rt_cases.
    APPEND `9269839|L550014:884265:,L538152:1162329:,L395492:3695817:,L681996:2600349:|OK:982528,1291491,4106510,2889310` TO rt_cases.
    APPEND `26745124|L049000:2445948:,L524165:4146733:X,L204635:295204:,L011961:1859218:,L439459:789797:,L803826:3136155:,`
        && `L236978:4144704:,L302942:0:,L971106:4308372:|OK:3255386,4146733,392896,2474489,1051164,4174003,5516311,0,57341`
        && `42` TO rt_cases.
    APPEND `8867948|L575410:3250997:,L275938:173136:X,L350942:619352:,L803898:1472076:,L194459:1842548:,L973395:4815469:|O`
        && `K:2355481,173136,448746,1066579,1335001,3489005` TO rt_cases.
    APPEND `19313307|L040941:0:,L307550:1324733:,L955540:3628442:,L823250:2046130:X,L742888:126429:,L010752:4454860:,L0577`
        && `53:634898:,L926753:0:,L981563:802597:|OK:0,2084806,5710279,2046130,198968,7010859,999174,0,1263091` TO rt_cases.
    APPEND `3147786|L565889:0:,L177096:3883903:X,L975523:2948387:X,L314732:3747413:,L082476:2183934:,L181382:2640408:,L082`
        && `021:700462:,L183145:2696225:,L528678:281460:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `22976603|L123485:3358117:,L285331:4816097:,L254258:2648273:,L748380:1107178:X,L254983:4227828:,L271387:4409082`
        && `:,L913293:4943336:X,L883550:3303816:,L558561:4316299:X,L232407:278392:,L453362:3984203:,L894969:3582704:|OK:13`
        && `83444,1984088,1091009,1107178,1741738,1816410,4943336,1361073,4316299,114689,1641372,1475967` TO rt_cases.
    APPEND `29715412|L394959:2284910:,L713776:2206475:,L662328:1888009:,L783082:2651668:,L112722:4481488:X,L751593:463651:`
        && `X,L541337:1678347:X,L051967:3595408:X,L794064:2136789:,L967654:4724605:,L534522:1032322:,L882933:0:X|OK:263210`
        && `5,2541751,2174894,3054592,4481488,463651,1678347,3595408,2461477,5442514,1189185,0` TO rt_cases.
    APPEND `19917470|L377957:4789824:,L754202:4895249:,L182817:1130947:X,L032495:3733897:,L870068:1943427:,L168402:84239:|`
        && `OK:5825484,5953705,1130947,4541244,2363637,102453` TO rt_cases.
    APPEND `10515831|L511079:3382272:,L224398:4244760:X,L301772:0:,L443710:2282479:|OK:3744290,4244760,0,2526781` TO rt_cases.
    APPEND `35439514|L061371:3655848:,L055690:4143085:,L138163:4644901:X,L967404:162861:,L778327:110190:,L848068:3364374:X`
        && `,L540490:0:,L574485:2886546:,L469508:3232992:,L517498:0:,L829477:3073048:|OK:5808473,6582603,4644901,258756,17`
        && `5072,3364374,0,4586193,5136632,0,4882510` TO rt_cases.
    APPEND `13051393|L042837:4674083:,L541953:2339286:X,L334849:2857966:|OK:6647498,2339286,4064609` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_02.
    APPEND `22185682|L328532:4864548:,L591255:334977:,L478549:3272608:,L629287:2991977:,L923768:3105639:X,L436058:559889:,`
        && `L306528:1082492:|OK:7081665,487650,4764166,4355632,3105639,815070,1575860` TO rt_cases.
    APPEND `13703063|L605962:2347890:,L052846:2969826:X,L823218:724531:,L547713:303172:,L679388:2399233:,L196804:1892461:X`
        && `,L740704:1249874:,L746634:3196849:X,L014098:4361066:,L085663:270208:|OK:1136869,2969826,350825,146799,1161730,`
        && `1892461,605200,3196849,2111667,130837` TO rt_cases.
    APPEND `31247474|L806677:3418665:,L620820:4313024:,L050482:681960:,L711257:275846:,L786373:4238127:,L047194:2190275:X,`
        && `L613837:4775161:,L029459:2194240:,L683513:3629719:,L677642:0:,L350955:4033730:|OK:3604323,4547251,718995,29082`
        && `6,4468287,2190275,5034486,2313403,3826838,0,4252790` TO rt_cases.
    APPEND `20673698|L242567:0:,L310049:844587:,L145326:4478096:,L576787:3954113:,L679717:4934768:,L456558:278384:|OK:0,12`
        && `05024,6389174,5641576,7040736,397188` TO rt_cases.
    APPEND `21684811|L959683:330536:,L730717:1679634:X,L387287:2451527:,L516424:524327:,L889621:0:,L795011:130239:,L397687`
        && `:0:,L704161:2906063:,L661472:4391711:X,L505683:2461162:,L484120:0:X,L840518:0:X|OK:586199,1679634,4347736,9298`
        && `84,0,230976,0,5153847,4391711,4364824,0,0` TO rt_cases.
    APPEND `17494264|L750657:4139449:X,L598102:3613918:,L913148:0:X,L417885:4475096:X,L905557:3401326:,L731609:885052:X,L9`
        && `23931:2401258:X|OK:4139449,2881457,0,4475096,2711952,885052,2401258` TO rt_cases.
    APPEND `6403635|L463117:4115925:X,L042225:4553719:,L533864:453443:,L357520:856493:X,L714315:449543:|OK:4115925,1194376`
        && `,118932,856493,117909` TO rt_cases.
    APPEND `3204372|L405788:4994973:,L669096:3532892:X,L241864:663412:,L061717:2981746:,L911467:2732783:|ERR:BELOW_LOCKED_`
        && `TOTAL` TO rt_cases.
    APPEND `15562454|L165606:3164131:,L962364:4282735:X,L240412:2764684:X,L115811:198145:,L597724:2826164:,L378369:3144244`
        && `:|OK:2886917,4282735,2764684,180785,2578560,2868773` TO rt_cases.
    APPEND `31997234|L508283:1669068:,L131045:4873018:X,L731945:4523246:X,L454150:4909625:,L828600:1712592:,L365895:317709`
        && `1:,L884773:4463067:|OK:2367805,4873018,4523246,6964987,2429550,4507146,6331482` TO rt_cases.
    APPEND `15287109|L902009:286313:,L811608:1198016:,L524588:0:,L945262:3269425:X,L652618:2780430:,L723463:0:X,L766063:33`
        && `67281:,L519722:1427681:X,L609694:196652:|OK:387300,1620576,0,3269425,3761134,0,4554978,1427681,266015` TO rt_cases.
    APPEND `1364286|L096576:4786763:,L919724:4906068:,L831133:1554569:|OK:580624,595096,188566` TO rt_cases.
    APPEND `10766584|L070380:0:X,L940837:4983149:,L157274:0:,L240826:1857061:X,L868046:4116682:X,L045625:0:,L143625:312404`
        && `7:,L939053:0:,L726103:1287400:X,L923581:2578747:|OK:0,1634684,0,1857061,4116682,0,1024819,0,1287400,845938` TO rt_cases.
    APPEND `24184697|L001392:4419829:X,L982025:2604825:,L492214:4927037:,L715897:4475773:,L176637:3136117:X,L778570:391887`
        && `2:X,L073985:3283793:X,L456149:889898:,L901541:2415825:,L397505:604865:|OK:4419829,1542465,2917579,2650360,3136`
        && `117,3918872,3283793,526959,1430548,358175` TO rt_cases.
    APPEND `8064859|L227834:2121914:,L305208:0:,L589887:77757:,L916122:70324:,L281860:1541068:,L871987:1959577:,L877832:17`
        && `38598:,L280120:422196:X,L935093:1565681:,L734806:102577:,L202250:4936643:,L075596:1014436:X|OK:996485,0,36516,`
        && `33025,723710,920249,816474,422196,735269,48172,2318327,1014436` TO rt_cases.
    APPEND `12514260|L706625:4869464:,L718798:0:X,L373572:2664797:,L146298:0:,L952704:0:X,L599742:1203811:,L604199:1886591`
        && `:,L823007:1971207:X,L817472:1479015:|OK:4241605,0,2321203,0,0,1048594,1643337,1971207,1288314` TO rt_cases.
    APPEND `3723864|L431707:2589256:,L481450:2747696:X,L637673:1231759:X,L459460:0:,L540427:27872:,L770092:582169:,L198503`
        && `:88747:,L033391:2566:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `15443464|L412359:1344321:,L952929:4839739:,L752296:2535901:X,L675857:1817781:X,L914387:290340:|OK:2302642,8289`
        && `826,2535901,1817781,497314` TO rt_cases.
    APPEND `18184734|L903744:1421362:,L585305:955277:,L135036:2760691:,L985092:3495976:,L851779:4748894:|OK:1931453,129810`
        && `2,3751433,4750594,6453152` TO rt_cases.
    APPEND `1446595|L875660:879080:,L648856:365239:|OK:1021983,424612` TO rt_cases.
    APPEND `14859952|L175747:277697:,L875800:1861458:,L390151:3074826:,L523451:0:X,L214266:1851653:,L143419:624379:,L49030`
        && `3:4392492:,L958370:3394882:|OK:266619,1787199,2952163,0,1777785,599471,4217264,3259451` TO rt_cases.
    APPEND `3143017|L477205:1375143:,L299538:185051:,L022146:707839:,L725079:4997120:,L944704:1100770:,L898500:1841689:,L1`
        && `87603:458439:,L883916:2994429:,L876567:958878:,L775715:0:|OK:295642,39784,152178,1074331,236655,395945,98560,6`
        && `43773,206149,0` TO rt_cases.
    APPEND `35141438|L747337:1736512:,L555754:3410390:X,L672516:2329313:,L001119:3555162:,L607823:3753054:,L377329:359895:`
        && `,L146420:2555458:,L457954:3993796:X,L883628:1940256:,L136612:1412215:|OK:2730214,3410390,3662240,5589569,59007`
        && `03,565842,4017794,3993796,3050549,2220341` TO rt_cases.
    APPEND `29682087|L300314:3362273:,L793464:4702964:,L761079:1175649:,L164575:4761545:,L869820:1667706:,L403118:2531783:`
        && `X,L005275:46784:X,L352429:3755437:X,L597628:3216307:,L000827:0:|OK:4156560,5813969,1453378,5886389,2061676,253`
        && `1783,46784,3755437,3976111,0` TO rt_cases.
    APPEND `2176933|L789921:4496187:X,L133479:4859561:X,L060934:2866396:,L331746:3024875:X,L462815:4574125:,L679583:210018`
        && `6:,L916945:0:,L291895:730504:X,L249068:0:,L390018:1310686:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `1781296|L628122:3415673:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `27616917|L893050:2821676:,L216520:2051515:X,L038368:0:,L012501:2002134:,L972235:883995:,L977860:1183217:X,L801`
        && `989:800888:,L811107:4711137:,L506417:3569570:X,L000328:2401536:X,L577804:0:|OK:4630204,2051515,0,3285384,14505`
        && `83,1183217,1314210,7730698,3569570,2401536,0` TO rt_cases.
    APPEND `9249351|L783624:2467998:,L982937:241473:,L384582:1888696:,L821013:1001382:,L407231:4316422:X,L300240:3536215:,`
        && `L097031:4573536:X|OK:97089,9499,74300,39393,4316422,139112,4573536` TO rt_cases.
    APPEND `6071628|L151690:0:,L387798:1579598:,L694507:0:,L192383:3511094:,L063793:2975736:|OK:0,1188969,0,2642812,223984`
        && `7` TO rt_cases.
    APPEND `11286966|L322737:4127903:,L759694:3264628:X,L607958:3930832:X,L911289:2407515:|OK:2584278,3264628,3930832,1507`
        && `228` TO rt_cases.
    APPEND `22642612|L606285:1987646:,L095232:2152624:,L818323:1918325:,L361388:4792657:,L301713:841520:,L131064:1422676:X`
        && `,L601277:4624063:X,L982666:4269741:,L342219:0:,L459250:4834613:|OK:1586119,1717770,1530802,3824486,671524,1422`
        && `676,4624063,3407205,0,3857967` TO rt_cases.
    APPEND `1713230|L380769:3114959:,L749288:48610:|OK:1686905,26325` TO rt_cases.
    APPEND `17708285|L258807:2095280:,L429080:4993074:,L800624:2010369:,L585333:2060948:,L092902:3097901:X,L079250:599035:`
        && `|OK:2603420,6203976,2497916,2560761,3097901,744311` TO rt_cases.
    APPEND `1807778|L435904:2616625:|OK:1807778` TO rt_cases.
    APPEND `3105650|L124481:0:,L633112:4970612:|OK:0,3105650` TO rt_cases.
    APPEND `42277925|L245055:4925526:,L916942:2875538:,L358791:4641729:X,L291309:1981315:,L718544:2132435:X,L568964:493101`
        && `9:X,L928029:2344371:X,L245660:2366530:,L133376:3755346:,L588141:3180884:,L888172:465153:|OK:7111893,4151946,46`
        && `41729,2860791,2132435,4931019,2344371,3416997,5422287,4592830,671627` TO rt_cases.
    APPEND `8416253|L916506:183798:,L127614:23962:,L445904:3686536:X,L237848:1011620:X,L856798:3626859:X,L033434:3094803:X`
        && `|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `2249922|L354386:1391630:,L296259:2617662:,L651721:440970:X|OK:627889,1181063,440970` TO rt_cases.
    APPEND `11688176|L303169:2413901:X,L338176:3464721:,L718051:2635698:,L567713:1566528:,L880749:0:,L877060:2896625:,L208`
        && `248:1590337:X|OK:2413901,2520236,1917206,1139492,0,2107004,1590337` TO rt_cases.
    APPEND `3978511|L401328:2400320:,L364900:2332882:,L160261:160473:,L224595:0:|OK:1951437,1896611,130463,0` TO rt_cases.
    APPEND `19846699|L617833:1986226:X,L061581:3267932:,L638522:564452:,L640578:0:,L566881:2583000:X,L351898:1476887:,L029`
        && `583:0:,L950779:2190468:,L003088:2878031:,L844880:587639:X,L996741:2521328:,L834141:4673764:|OK:1986226,2731791`
        && `,471847,0,2583000,1234587,0,1831097,2405857,587639,2107675,3906980` TO rt_cases.
    APPEND `15456711|L170630:776258:,L261118:0:,L714365:4305355:,L033641:1812056:,L984147:4021869:X,L212617:3817867:X,L856`
        && `584:3897189:X,L653227:2569000:,L391221:3836912:,L193508:1353425:X,L770616:0:|OK:138118,0,766041,322414,4021869`
        && `,3817867,3897189,457096,682692,1353425,0` TO rt_cases.
    APPEND `2067524|L694604:3878422:,L876166:1979374:,L841665:974592:|OK:1173635,598971,294918` TO rt_cases.
    APPEND `6690974|L470036:2183690:,L704852:1778681:,L428608:1691766:|OK:2584128,2104850,2001996` TO rt_cases.
    APPEND `7988942|L425403:974868:,L570948:1704836:,L568219:0:,L221269:4019527:|OK:1162546,2033045,0,4793351` TO rt_cases.
    APPEND `27550941|L503599:3882592:,L565789:133392:,L914874:1232306:X,L296044:1897733:X,L160300:0:,L640760:2214975:,L750`
        && `663:1367906:X,L581097:405456:,L511462:3877598:,L383928:3619280:X,L436670:1570719:,L441055:0:|OK:6243679,214511`
        && `,1232306,1897733,0,3561949,1367906,652022,6235648,3619280,2525907,0` TO rt_cases.
    APPEND `3752505|L769357:4145392:,L051807:2872974:X|OK:879531,2872974` TO rt_cases.
    APPEND `821323|L131574:1185471:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `27526069|L768825:132762:,L188426:2346445:,L143356:3689380:,L735699:4019545:X,L612977:4420003:,L130078:4039600:`
        && `X,L607517:2192747:,L912865:3635114:,L557616:3377574:|OK:130568,2307670,3628412,4019545,4346961,4039600,2156511`
        && `,3575043,3321759` TO rt_cases.
    APPEND `1|L107429:0:|ERR:NO_DRIVER` TO rt_cases.
    APPEND `26123606|L361262:2664696:,L725471:1044918:,L278253:4571167:,L307101:0:,L372924:4764998:,L443954:996864:,L24254`
        && `3:1349252:,L961572:886557:,L303229:2115731:|OK:3784428,1484003,6492018,0,6767299,1415756,1916222,1259097,30047`
        && `83` TO rt_cases.
    APPEND `3807214|L806435:2555248:,L413146:3440279:,L388497:1427680:|OK:1310536,1764450,732228` TO rt_cases.
    APPEND `13052194|L343358:2045006:,L327809:3217936:,L893751:2611902:X,L640405:4560308:|OK:2173462,3420069,2611902,48467`
        && `61` TO rt_cases.
    APPEND `6905832|L935006:729271:,L641117:3626225:,L189342:2874053:X|OK:675069,3356710,2874053` TO rt_cases.
    APPEND `15527010|L200365:2869094:X,L822996:2710852:,L112571:3547033:X,L773116:565680:X,L196847:4653394:,L798944:831005`
        && `:|OK:2869094,2826610,3547033,565680,4852102,866491` TO rt_cases.
    APPEND `2068141|L104221:1481551:|OK:2068141` TO rt_cases.
    APPEND `11579608|L269269:559548:,L520913:3491788:,L284343:1911563:,L722208:1090858:,L976579:663882:,L326006:3370125:,L`
        && `276276:3252288:,L165672:1181092:|OK:417453,2605061,1426129,813839,495292,2514294,2426382,881158` TO rt_cases.
    APPEND `15574610|L705567:2729925:X,L327958:3690670:X,L953451:165035:X,L282711:4850421:X,L655208:93810:,L468780:221851:`
        && `,L198904:4211165:,L507714:4419810:,L057980:3239572:X,L256840:1992086:|OK:2729925,3690670,165035,4850421,7710,1`
        && `8233,346090,363237,3239572,163717` TO rt_cases.
    APPEND `11551548|L356366:3771764:X,L595600:4691463:X,L383748:3603446:,L978559:172504:|OK:3771764,4691463,2947231,14109`
        && `0` TO rt_cases.
    APPEND `17592295|L925888:1548409:,L122549:2369810:,L325763:0:,L900452:2358137:X,L452986:3634700:,L996107:1337732:,L264`
        && `975:2122651:,L486392:1242016:,L932392:853632:,L608105:2874267:,L027780:4629378:X,L271352:356377:|OK:1004954,15`
        && `38062,0,2358137,2359006,868219,1377650,806098,554027,1865467,4629378,231297` TO rt_cases.
    APPEND `11071450|L360756:915593:,L642565:117729:,L558088:4321746:,L758552:4443622:,L693514:3202333:,L995487:3860683:|O`
        && `K:601181,77301,2837672,2917697,2102662,2534937` TO rt_cases.
    APPEND `8289740|L576187:1850968:X,L654853:0:X,L932800:4502245:,L087591:1139097:X,L036116:2181800:,L058833:0:X,L071386:`
        && `2406334:,L809774:3743972:,L544928:170958:|OK:1850968,0,1834669,1139097,889085,0,980583,1525672,69666` TO rt_cases.
    APPEND `6796037|L510198:985456:X,L898082:2705448:,L571748:2770611:|OK:985456,2870719,2939862` TO rt_cases.
    APPEND `4137018|L344930:1377888:,L749450:3741799:X,L388254:792025:X,L829835:2308911:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `1|L294552:0:|ERR:NO_DRIVER` TO rt_cases.
    APPEND `2546594|L126918:1084077:,L078050:3330229:,L100009:0:,L255870:0:,L156700:3753134:,L665250:4683032:X,L027256:0:X`
        && `,L809870:1930071:,L409059:431322:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `29980911|L294093:4227935:,L311125:4152545:X,L899991:256594:,L012907:0:X,L598426:3802603:X,L772381:4462061:,L00`
        && `0779:4257414:X,L131124:1758831:,L926938:0:,L613524:823417:,L836286:2186758:X,L761389:3677553:|OK:4332255,41525`
        && `45,262925,0,3802603,4572157,4257414,1802228,0,843734,2186758,3768292` TO rt_cases.
    APPEND `17907831|L571686:4981491:X,L216744:2012468:,L188159:527078:X,L226444:489367:X,L967790:4030308:,L697200:3003742`
        && `:,L453073:2049142:X,L162075:989646:,L795859:852387:,L793151:0:X|OK:4981491,1822506,527078,489367,3649877,27202`
        && `11,2049142,896231,771928,0` TO rt_cases.
    APPEND `16124198|L844411:2385236:,L240630:168629:,L417202:3397765:X,L876843:3455875:,L513543:3938377:,L019659:3292677:`
        && `,L006460:3571309:,L325958:0:,L202564:1559655:,L724227:667868:,L970163:2024016:X,L703175:3240027:|OK:1145790,81`
        && `004,3397765,1660089,1891868,1581694,1715540,0,749207,320822,2024016,1556403` TO rt_cases.
    APPEND `3089984|L760583:249143:,L277576:4677877:|OK:156250,2933734` TO rt_cases.
    APPEND `10993230|L659274:4703286:,L592289:2698623:,L293647:3695000:,L706594:3541212:,L114162:4924787:|OK:2642976,15164`
        && `71,2076378,1989958,2767447` TO rt_cases.
    APPEND `32342816|L085786:0:X,L067551:538030:,L482798:2346611:X,L773871:1028039:,L597134:1947127:,L412950:2089435:,L912`
        && `994:1658081:,L156954:3110240:X,L032933:4756588:,L396488:4628561:|OK:0,869012,2346611,1660462,3144949,3374802,2`
        && `678090,3110240,7682718,7475932` TO rt_cases.
    APPEND `4786497|L167892:4724508:,L699573:3929809:X,L421174:650612:|OK:752993,3929809,103695` TO rt_cases.
    APPEND `7826070|L198044:3227608:,L467782:3214627:X,L935235:3414496:,L066020:787318:,L696229:0:,L489232:3592798:,L75352`
        && `5:3074945:,L094800:4913560:,L751092:4665085:|OK:628656,3214627,665057,153349,0,699785,598921,957036,908639` TO rt_cases.
    APPEND `12011891|L114228:2180181:,L726082:2279998:,L546267:4831044:,L951385:3441000:|OK:2056836,2151006,4557725,324632`
        && `4` TO rt_cases.
    APPEND `38797722|L194175:742395:,L947758:4203778:,L730837:1167092:,L893463:3741:,L782065:0:,L866709:4790779:,L714638:2`
        && `096614:,L381074:4041116:X,L249307:2743670:X,L690541:3860781:X,L177862:1505528:,L722172:3340118:|OK:1170867,662`
        && `9978,1840676,5900,0,7555765,3306670,4041116,2743670,3860781,2374440,5267859` TO rt_cases.
    APPEND `11835854|L909121:249734:,L706139:4297312:,L593329:3287975:,L518313:896588:|OK:338519,5825084,4456910,1215341` TO rt_cases.
    APPEND `6940872|L143741:203029:X,L893482:0:,L644960:859174:,L820877:4231429:X|OK:203029,0,2506414,4231429` TO rt_cases.
    APPEND `35742519|L991335:4976522:,L565205:4277143:,L661482:1061630:X,L441397:2818758:,L088376:1483377:,L469763:1987287`
        && `:,L864650:2168986:X,L689220:946370:X,L627340:1071898:,L688887:597466:,L105931:4063286:,L422544:4088215:X|OK:64`
        && `27109,5523871,1061630,3640387,1915761,2566553,2168986,946370,1384341,771619,5247677,4088215` TO rt_cases.
    APPEND `10650720|L161341:3294762:,L540768:4521564:,L247385:3952237:,L047815:2712990:,L380079:2471380:|OK:2069942,28406`
        && `83,2483002,1704443,1552650` TO rt_cases.
    APPEND `6973|L833944:3351757:X,L162377:877319:,L560652:3992020:,L418140:398730:,L621045:1579033:,L750492:2286087:,L577`
        && `038:347854:,L118951:2507801:,L273819:285278:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `5329085|L560773:2867033:,L532639:254292:,L782395:354725:,L092909:1133862:|OK:3314307,293963,410064,1310751` TO rt_cases.
    APPEND `13377745|L599719:851456:X,L746484:2543648:,L874510:1267238:,L695414:3313116:,L932003:1054706:|OK:851456,389578`
        && `3,1940868,5074279,1615359` TO rt_cases.
    APPEND `25284380|L252785:3064969:,L371410:93930:,L908079:4151076:X,L782051:576898:X,L256941:2920940:,L565366:4077296:,`
        && `L085329:2610816:,L310159:1576728:,L336271:4753669:,L237876:4992875:,L124972:0:|OK:2615257,80148,4151076,576898`
        && `,2492361,3479049,2227741,1345380,4056181,4260289,0` TO rt_cases.
    APPEND `11032329|L771137:1205157:,L067141:1659426:,L654233:2370187:,L385933:2030021:,L850206:4534354:,L451593:4768431:`
        && `,L214512:0:X,L485260:2061722:X|OK:652539,898506,1283351,1099166,2455151,2581894,0,2061722` TO rt_cases.
    APPEND `15325099|L461085:2875333:,L567729:4846148:,L181631:55058:,L320535:1322926:,L676210:1652277:,L227285:4564296:,L`
        && `740934:4670080:,L271114:319969:|OK:2170027,3657411,41553,998418,1246981,3444696,3524531,241482` TO rt_cases.
    APPEND `36630349|L496653:1271679:,L918899:0:,L368371:1866238:,L944488:4142695:,L720094:4002786:,L440388:1394897:,L4900`
        && `53:1539301:,L804003:4039445:,L472702:4718120:,L157822:0:,L404325:306904:,L024079:1251144:|OK:1898734,0,2786466`
        && `,6185427,5976529,2082710,2298319,6031265,7044589,0,458236,1868074` TO rt_cases.
    APPEND `10750849|L297034:3536950:,L659188:4885159:X,L983357:616341:|OK:4995232,4885159,870458` TO rt_cases.
    APPEND `9985060|L874283:4139919:,L060283:2091505:,L227529:1621078:X,L289001:2879778:,L638444:0:,L307700:422789:|OK:363`
        && `1869,1834836,1621078,2526372,0,370905` TO rt_cases.
    APPEND `8308441|L962568:3230665:,L513686:566394:X,L245131:0:,L725818:1037805:,L808808:2925545:,L422021:23710:,L585778:`
        && `1702019:X,L380000:723052:|OK:2457355,566394,0,789390,2225270,18035,1702019,549978` TO rt_cases.
    APPEND `14398588|L070294:3925073:X,L349082:834862:X,L637525:3841207:,L614015:2893617:|OK:3925073,834862,5497406,414124`
        && `7` TO rt_cases.
    APPEND `7793819|L257666:446406:,L909550:1453584:,L925762:3954659:X,L568979:2529674:,L667387:0:,L692775:1414434:,L26093`
        && `4:0:|OK:293257,954902,3954659,1661817,0,929184,0` TO rt_cases.
    APPEND `24987059|L932727:1931249:,L564202:4307297:,L637262:4346145:X,L603540:4006540:,L976486:1411736:,L816317:2927096`
        && `:,L718068:2876052:,L229130:0:,L497917:4685916:,L840809:896845:X,L245257:0:|OK:1721797,3840152,4346145,3572013,`
        && `1258627,2609640,2564132,0,4177708,896845,0` TO rt_cases.
    APPEND `37977615|L563447:2324093:X,L515606:2367756:,L914715:4173272:,L654605:4519566:X,L389546:4313794:X,L581316:43059`
        && `76:,L260783:3903341:X,L186716:1402760:X|OK:2324093,4696232,8277311,4519566,4313794,8540518,3903341,1402760` TO rt_cases.
    APPEND `20378291|L178367:2916392:X,L973172:4160554:,L725724:0:X,L018668:4484988:,L125356:3324858:,L397678:3546522:,L81`
        && `1646:1536942:,L917088:1917538:X,L086496:1600113:,L405704:4188408:,L444479:3248981:|OK:2916392,2478719,0,267200`
        && `5,1980839,2112899,915658,1917538,953294,2495313,1935634` TO rt_cases.
    APPEND `10362515|L498897:2346047:,L522767:1467645:,L045214:2753708:X,L447460:3308542:|OK:2506323,1567911,2753708,35345`
        && `73` TO rt_cases.
    APPEND `18327098|L781013:1503365:,L242469:4890847:,L364796:2347082:,L920895:2313222:X,L189547:0:X,L243283:2853894:X,L8`
        && `14737:865904:,L045707:576476:X,L810326:1243586:,L855830:184886:|OK:1714223,5576825,2676278,2313222,0,2853894,9`
        && `87354,576476,1418008,210818` TO rt_cases.
    APPEND `8657950|L801067:2811580:,L285114:3179194:|OK:4063335,4594615` TO rt_cases.
    APPEND `1|L023770:0:,L093983:0:X|ERR:NO_DRIVER` TO rt_cases.
    APPEND `12259124|L059217:3668684:,L885127:1725168:X,L332904:3234061:,L740132:2015980:,L294807:1767374:X|OK:3606100,172`
        && `5168,3178892,1981590,1767374` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_03.
    APPEND `21292094|L334910:2606679:,L505700:1210767:X,L538773:3295663:,L743779:1156413:,L666965:38406:,L650678:4603720:,`
        && `L695737:86607:X,L917421:138911:,L110042:1287977:X|OK:4118524,1210767,5207112,1827120,60681,7273828,86607,21947`
        && `8,1287977` TO rt_cases.
    APPEND `7515427|L153258:3393338:X,L369096:2559048:,L212675:0:,L984221:0:|OK:3393338,4122089,0,0` TO rt_cases.
    APPEND `17996910|L233389:38633:,L828996:4998088:X,L712212:1107179:X,L422412:1414181:,L916043:4441830:X,L265036:477981:`
        && `,L039431:4068292:,L943639:3736940:,L730668:539345:X,L702112:276658:X,L867648:4866711:X,L934664:3960538:|OK:498`
        && `4,4998088,1107179,182454,4441830,61668,524882,482131,539345,276658,4866711,510980` TO rt_cases.
    APPEND `11522284|L487054:3742968:,L112531:1366541:,L054960:0:X,L190075:2929630:,L230776:0:,L844200:0:X,L192585:1667885`
        && `:,L202547:2475068:X,L594622:301785:,L001474:2254947:X|OK:2540087,927375,0,1988132,0,0,1131875,2475068,204800,2`
        && `254947` TO rt_cases.
    APPEND `4162904|L296599:533951:,L295142:297149:,L411096:0:,L945558:1507986:,L544289:3265134:|OK:396627,220727,0,112015`
        && `6,2425394` TO rt_cases.
    APPEND `18968533|L888196:3450686:,L266816:0:,L426260:1706714:,L418120:4155912:,L163701:216797:,L047951:4199773:,L04959`
        && `9:406427:,L172273:833669:|OK:4372381,0,2162586,5265977,274704,5321553,514986,1056346` TO rt_cases.
    APPEND `26614836|L682369:3441377:X,L167401:3662926:X,L199917:4079067:,L028294:627287:,L221983:2052119:,L233578:3115452`
        && `:,L094701:2843907:,L507591:3454458:|OK:3441377,3662926,4921058,756770,2475712,3758536,3430939,4167518` TO rt_cases.
    APPEND `30065647|L463270:1329618:,L507548:1758052:,L723421:1322514:X,L443889:4595537:X,L800491:1043732:X,L780595:45833`
        && `06:,L528683:621791:,L366669:1564354:X,L219491:3469716:,L272458:2089925:,L475222:0:,L840552:3198495:|OK:1679636`
        && `,2220855,1322514,4595537,1043732,5789850,785476,1564354,4383110,2640092,0,4040491` TO rt_cases.
    APPEND `15615477|L416130:3142565:X,L039796:4510525:,L453863:3373191:X|OK:3142565,9099721,3373191` TO rt_cases.
    APPEND `6474951|L600972:848654:,L601485:0:X,L305773:662024:X,L230860:2574844:,L421566:172379:,L864434:4121282:|OK:6392`
        && `46,0,662024,1939494,129844,3104343` TO rt_cases.
    APPEND `3965340|L774660:194587:X,L232862:1366038:,L423320:2016970:,L935044:2384743:,L114413:2834397:|OK:194587,598803,`
        && `884139,1045353,1242458` TO rt_cases.
    APPEND `11831650|L793193:3437074:,L088799:2571585:,L659052:3618816:,L792458:1874220:,L995130:3964584:,L936371:153187:,`
        && `L958111:339632:X,L296628:3121975:,L254110:235404:,L909575:150088:,L243823:2173207:,L639092:1963976:|OK:1697847`
        && `,1270313,1787624,925828,1958427,75671,339632,1542195,116285,74140,1073522,970166` TO rt_cases.
    APPEND `42373602|L769685:4679591:,L762294:1475213:X,L149959:3189854:X,L920376:4309222:,L237580:4212859:,L791763:388145`
        && `5:,L533769:4648272:,L476434:203037:,L007214:0:X,L242179:4023344:X,L915520:2180417:|OK:6536756,1475213,3189854,`
        && `6019401,5884795,5421868,6493008,283615,0,4023344,3045748` TO rt_cases.
    APPEND `6267683|L022596:1525706:X,L189048:1808259:,L749569:4234825:,L159256:0:,L827718:1607240:X,L399852:94611:|OK:152`
        && `5706,923542,2162874,0,1607240,48321` TO rt_cases.
    APPEND `8806252|L827111:3641442:X,L989046:1576065:,L077141:3891959:,L200989:1233537:,L751842:13904:,L066993:767367:,L8`
        && `46097:804453:|OK:3641442,982237,2425551,768766,8665,478239,501352` TO rt_cases.
    APPEND `29680025|L935802:4235468:X,L725736:3067975:,L631568:3998010:,L307357:0:,L571283:0:,L361598:2409533:,L336487:49`
        && `81825:,L593899:1247483:,L703078:0:X,L336402:1975005:,L732582:2917810:,L455615:917054:|OK:4235468,3628370,47282`
        && `84,0,0,2849657,5891802,1475348,0,2335758,3450775,1084563` TO rt_cases.
    APPEND `16273516|L533331:3604206:,L564317:2477206:,L265262:4832025:X|OK:6780907,4660584,4832025` TO rt_cases.
    APPEND `9456635|L053892:1163901:,L316849:3539115:,L157672:4091449:,L993027:0:,L862111:937829:X,L711685:3874915:|OK:782`
        && `599,2379677,2751063,0,937829,2605467` TO rt_cases.
    APPEND `14374055|L680029:2963404:,L433738:3727161:,L021757:3870204:|OK:4033431,5072965,5267659` TO rt_cases.
    APPEND `412608|L823654:1975875:X,L224568:3916116:,L850714:2881589:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `11348223|L023665:0:,L301063:3240:X,L655807:1824204:X,L780169:1229452:,L313657:2296130:,L935701:1004051:,L31235`
        && `4:3503551:,L020891:4733439:,L545281:1263814:,L487005:2962392:,L403821:3531619:X|OK:0,3240,1824204,433323,80927`
        && `6,353880,1234834,1668311,445434,1044102,3531619` TO rt_cases.
    APPEND `7427461|L261451:2186891:,L744881:2993921:,L210413:1616431:,L250448:4703096:|OK:1412397,1933615,1043968,3037481` TO rt_cases.
    APPEND `7399535|L193896:2712301:,L367373:2021541:,L790300:3104913:,L868745:216289:|OK:2491577,1857031,2852239,198688` TO rt_cases.
    APPEND `10777975|L857938:1684488:,L628315:2360735:X,L024965:3254995:,L338646:1777422:,L406595:2193907:,L504133:671809:`
        && `X,L327735:1693221:X,L774355:834901:|OK:1046088,2360735,2021393,1103801,1362444,671809,1693221,518484` TO rt_cases.
    APPEND `13871113|L538208:0:X,L828940:161956:,L360763:3487571:,L588253:2193517:X,L951623:1143085:,L503432:0:,L619301:26`
        && `34737:X,L413309:1417502:|OK:0,235832,5078427,2193517,1664504,0,2634737,2064096` TO rt_cases.
    APPEND `2467538|L175999:4038737:X,L342558:0:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `24617989|L468590:1159919:,L634539:4734550:,L025326:4223845:X,L968552:1263932:X,L604522:4311547:,L424914:45029:`
        && `X,L874995:4632778:,L743226:2007696:X,L526653:3161798:,L720036:2528582:X|OK:937500,3826681,4223845,1263932,3484`
        && `790,45029,3744424,2007696,2555510,2528582` TO rt_cases.
    APPEND `1935047|L353531:1602244:,L766082:2781554:,L707118:3260226:|OK:405600,704137,825310` TO rt_cases.
    APPEND `6921106|L797757:2620167:X,L161898:2766496:|OK:2620167,4300939` TO rt_cases.
    APPEND `0|L981504:0:|OK:0` TO rt_cases.
    APPEND `3090051|L319406:149161:,L550725:1665847:,L522574:2993972:X,L403148:1513592:X,L846499:4730823:|ERR:BELOW_LOCKED`
        && `_TOTAL` TO rt_cases.
    APPEND `7219710|L333270:4618019:X,L260339:2966359:|OK:4618019,2601691` TO rt_cases.
    APPEND `6031370|L093747:3977808:,L186568:135584:,L395789:1285220:,L691961:2902462:X,L904402:3591118:,L130910:0:X|OK:13`
        && `84490,47191,447325,2902462,1249902,0` TO rt_cases.
    APPEND `39590141|L214096:3761856:X,L044501:3194987:,L956011:417052:X,L033996:2393851:,L411378:323065:,L754443:1030912:`
        && `,L023033:1365480:,L259288:3804474:X,L496031:4787299:,L215045:4278207:,L913540:0:,L256515:2961579:X|OK:3761856,`
        && `5267758,417052,3946879,532656,1699723,2251345,3804474,7893094,7053725,0,2961579` TO rt_cases.
    APPEND `22324552|L869303:3806908:,L287949:3592854:X,L779578:1263784:,L528882:198118:,L829618:2033982:X,L528083:3347484`
        && `:,L527076:0:,L792106:3915129:|OK:5072582,3592854,1683951,263986,2033982,4460414,0,5216783` TO rt_cases.
    APPEND `6983311|L094965:3881932:,L185765:4347223:,L591869:213409:|OK:3210961,3595828,176522` TO rt_cases.
    APPEND `1553600|L623184:1580185:|OK:1553600` TO rt_cases.
    APPEND `3486819|L419287:2713642:,L212183:0:,L410585:377435:,L790005:1390747:X|OK:1840132,0,255940,1390747` TO rt_cases.
    APPEND `18467254|L914499:2281143:,L507636:546817:X,L201611:3377623:,L383049:4875472:X,L290524:41304:,L777416:1777583:,`
        && `L061599:1765987:|OK:3219233,546817,4766626,4875472,58290,2508590,2492226` TO rt_cases.
    APPEND `11376508|L106458:2262766:,L954981:3841809:X,L831197:3362022:,L995779:4522247:,L065348:227203:,L587874:486497:X`
        && `,L233611:164063:,L413718:4510136:X,L710672:3082048:X,L691295:1216744:,L286602:799629:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `16664352|L820966:2708111:X,L653693:3132733:,L266797:1334936:,L100021:3396136:,L374429:1964770:X,L701883:422765`
        && `1:X,L641549:3913139:,L743393:4646489:X|OK:2708111,829227,353355,898950,1964770,4227651,1035799,4646489` TO rt_cases.
    APPEND `17951534|L558146:4775452:,L177790:0:X,L274092:3981468:,L640117:3960354:X,L827540:2862104:X,L662623:3463466:,L1`
        && `71728:3325107:,L771347:3409480:X,L146097:1366100:X,L308003:4677523:,L797595:1976656:X|OK:1033545,0,861704,3960`
        && `354,2862104,749593,719648,3409480,1366100,1012350,1976656` TO rt_cases.
    APPEND `20723785|L802680:1448073:,L145249:1941661:,L996881:4761626:X,L444143:3026515:X,L609333:2501074:,L262521:998990`
        && `:X,L952129:1099012:,L553021:4115753:,L172332:3848715:X,L081977:4162356:|OK:767093,1028563,4761626,3026515,1324`
        && `904,998990,582184,2180254,3848715,2204941` TO rt_cases.
    APPEND `23836219|L627837:2642979:X,L456861:3855171:,L511023:2309031:,L734885:3016420:,L435019:2157701:,L142639:2210225`
        && `:,L648653:2019024:,L579106:4111812:X,L578540:2296838:,L520904:1536694:,L533980:95673:,L350131:3128945:X|OK:264`
        && `2979,2758877,1652412,2158641,1544116,1581704,1444875,4111812,1643687,1099705,68466,3128945` TO rt_cases.
    APPEND `23143331|L913788:78847:X,L948893:1855132:X,L224477:1705367:,L591339:3690927:X,L299631:3845395:,L111425:3846583`
        && `:,L804312:380150:,L347131:0:X,L661099:3930820:|OK:78847,1855132,2179359,3690927,4914190,4915708,485810,0,50233`
        && `58` TO rt_cases.
    APPEND `24697208|L126034:0:,L855676:3567234:,L793766:2856540:,L321076:4394956:X,L616502:0:,L423033:0:X,L676767:3026779`
        && `:,L632712:2228963:X,L302545:4786854:,L797441:3480071:,L021882:3501796:,L551884:1158866:|OK:0,2881010,2307031,4`
        && `394956,0,0,2444522,2228963,3866014,2810615,2828160,935937` TO rt_cases.
    APPEND `16449417|L370375:0:,L941884:3877109:,L033438:0:X,L119894:0:X,L232089:2332273:X,L793600:1133546:X,L680103:0:,L2`
        && `36852:712607:X,L879870:4700788:|OK:0,5546344,0,0,2332273,1133546,0,712607,6724647` TO rt_cases.
    APPEND `8625834|L876714:3633442:X,L058972:1989549:,L580496:1675488:,L341581:1688212:,L937585:324786:X,L801254:364380:|`
        && `OK:3633442,1624175,1367790,1378178,324786,297463` TO rt_cases.
    APPEND `4816541|L067352:2374740:,L852092:1915115:X,L669939:3135314:|OK:1250465,1915115,1650961` TO rt_cases.
    APPEND `21749418|L835073:4119132:,L532415:942636:,L437181:4599367:,L302834:2505823:,L053608:3188662:,L033243:1152665:X`
        && `,L225129:2549069:,L952007:3187946:|OK:4022292,920475,4491237,2446912,3113698,1152665,2489141,3112998` TO rt_cases.
    APPEND `13261461|L891906:0:,L846794:1762485:,L500565:1846248:,L636342:0:X,L373221:3910063:,L990665:2042339:X|OK:0,2629`
        && `880,2754867,0,5834375,2042339` TO rt_cases.
    APPEND `22008426|L953715:454524:,L644348:2305021:,L978196:1476364:,L607730:4644885:X,L526071:393564:X,L540968:3963721:`
        && `,L333525:4495672:,L971200:2866344:|OK:495658,2513626,1609975,4644885,393564,4322438,4902531,3125749` TO rt_cases.
    APPEND `13701780|L667757:3417300:X,L029238:2472985:,L997482:3350004:,L991378:1984730:,L086718:1496329:X,L228199:226479`
        && `7:,L702816:346421:X,L310683:1178093:,L790768:0:,L891466:1505848:X,L728094:1386245:X|OK:3417300,1219860,1652471`
        && `,979017,1496329,1117166,346421,581123,0,1505848,1386245` TO rt_cases.
    APPEND `15428017|L666296:4204098:X,L009292:2722464:,L551938:3849040:,L210833:0:|OK:4204098,4649882,6574037,0` TO rt_cases.
    APPEND `15486091|L296369:4145296:,L874271:1625353:,L624816:4555056:X,L362108:1521909:,L892496:3081742:,L539082:4442278`
        && `:|OK:3058221,1199116,4555056,1122799,2273577,3277322` TO rt_cases.
    APPEND `6031034|L717246:4383243:X,L091983:1049832:|OK:4383243,1647791` TO rt_cases.
    APPEND `16060357|L456082:4241168:,L335323:1784927:,L663719:0:,L545451:4555114:,L944164:2893207:,L610949:462442:,L57263`
        && `6:981029:|OK:4565973,1921624,0,4903962,3114780,497858,1056160` TO rt_cases.
    APPEND `14882|L450668:2764296:X,L818438:2813561:,L559326:1915230:,L702204:4537103:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `15000929|L500235:520820:X,L551684:4491763:X,L269655:0:X,L579601:1889112:,L882041:828089:,L451963:2772793:X,L02`
        && `6976:3832320:|OK:520820,4491763,0,2081219,912299,2772793,4222035` TO rt_cases.
    APPEND `6756020|L348093:3210899:,L097774:4579787:,L361786:0:,L206446:0:,L033953:1628601:|OK:2303030,3284870,0,0,116812`
        && `0` TO rt_cases.
    APPEND `20881248|L735037:901466:,L761371:0:,L984198:3584300:X,L241649:2313630:,L952878:1778006:,L139007:807234:,L51659`
        && `3:4500492:X,L776161:1885578:X,L354309:1752399:X,L806704:0:X,L068456:2665992:,L170830:2394838:X|OK:720170,0,358`
        && `4300,1848329,1420426,644889,4500492,1885578,1752399,0,2129827,2394838` TO rt_cases.
    APPEND `5794758|L020865:4121260:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `18464487|L184163:4658090:,L168737:1201202:X,L943885:2934344:,L167177:1957635:,L244501:3274426:,L387912:1408806`
        && `:,L726808:2369400:,L936711:3468836:X,L014025:3020554:|OK:3274471,1201202,2062739,1376148,2301805,990340,166560`
        && `4,3468836,2123342` TO rt_cases.
    APPEND `10024193|L714753:0:X,L431257:4591122:,L112616:629986:X,L665859:2430320:X,L942568:4058143:,L370407:0:,L056530:1`
        && `288419:,L405118:2509486:,L118874:1027591:|OK:0,2372736,629986,2430320,2097288,0,665867,1296927,531069` TO rt_cases.
    APPEND `7067582|L315568:1774830:,L270805:1457506:,L400041:0:,L648835:2943901:,L428024:4778437:,L064238:0:|OK:1145060,9`
        && `40333,0,1899304,3082885,0` TO rt_cases.
    APPEND `15556899|L601737:3504013:X,L772355:4193954:X,L651281:2816467:,L378658:4433204:X,L075154:2649385:X,L641572:3755`
        && `604:,L606526:0:X|OK:3504013,4193954,332702,4433204,2649385,443641,0` TO rt_cases.
    APPEND `3331438|L238327:3849975:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `13648103|L842381:2423906:,L984910:702629:X,L246404:2659125:X,L432469:3453589:X|OK:6832760,702629,2659125,34535`
        && `89` TO rt_cases.
    APPEND `25751006|L171107:2198840:,L071077:1191540:,L955406:462795:,L928509:4492714:,L421170:3867728:,L519312:29973:,L8`
        && `67975:0:,L462846:0:,L122743:4329298:,L549513:2202493:,L336330:0:,L347690:4789025:X|OK:2454919,1330308,516693,5`
        && `015940,4318167,33464,0,0,4833492,2458998,0,4789025` TO rt_cases.
    APPEND `27257339|L971361:214454:,L485155:3417058:X,L235636:3554226:X,L313550:1167263:X,L416727:3272455:X,L631464:49103`
        && `5:,L467468:3329483:X,L638464:1537959:X,L178824:225849:,L507919:760346:,L269957:1366133:X|OK:1218605,3417058,35`
        && `54226,1167263,3272455,2790239,3329483,1537959,1283356,4320562,1366133` TO rt_cases.
    APPEND `1194934|L741387:1978758:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `17823011|L346827:1348962:,L420421:3713191:,L005611:292383:X,L410576:3840061:,L347160:4045940:X|OK:2043349,5624`
        && `581,292383,5816758,4045940` TO rt_cases.
    APPEND `9251045|L256185:808983:X,L319937:1350323:X,L651996:1262841:,L012534:1406050:,L298580:434421:,L359207:774467:,L`
        && `560344:951169:,L141815:1527604:|OK:808983,1350323,1408899,1568671,484665,864040,1061180,1704284` TO rt_cases.
    APPEND `13324385|L934000:0:,L817508:848231:X,L765327:1789205:X,L199523:430097:X,L754152:4800213:,L509308:188943:,L4678`
        && `53:1263797:,L841011:0:X|OK:0,848231,1789205,430097,7873892,309927,2073033,0` TO rt_cases.
    APPEND `3075102|L875849:4429192:|OK:3075102` TO rt_cases.
    APPEND `1264612|L042266:478949:,L031370:0:,L434417:597823:|OK:562500,0,702112` TO rt_cases.
    APPEND `28980699|L219081:512342:,L572829:3100912:,L290581:2743379:,L942760:1085224:,L746362:929016:,L568473:3623946:,L`
        && `374517:4590003:X,L209813:4300969:,L276268:2664091:|OK:659096,3989129,3529185,1396073,1195121,4661979,4590003,5`
        && `532927,3427186` TO rt_cases.
    APPEND `3765970|L570863:365:,L183488:0:,L608084:2670317:|OK:515,0,3765455` TO rt_cases.
    APPEND `25527197|L036186:3285593:X,L370277:4069384:X,L628064:0:,L127278:1330257:,L135949:0:,L992391:0:X,L634326:332542`
        && `1:,L392764:442944:,L692286:1406242:,L139219:4291746:|OK:3285593,4069384,0,2239011,0,0,5597153,745537,2366904,7`
        && `223615` TO rt_cases.
    APPEND `35870527|L330869:2985304:,L670628:4281185:X,L457510:357510:X,L280959:831496:,L159788:2187656:,L710053:3803372:`
        && `,L722144:4387846:X,L630536:4030575:,L123695:1281427:,L585361:1047672:|OK:4956700,4281185,357510,1380588,363231`
        && `2,6314993,4387846,6692234,2127639,1739520` TO rt_cases.
    APPEND `21757269|L276953:4594688:,L070046:1601664:X,L361480:2584436:X,L015044:1252086:,L028447:4443672:,L995050:318947`
        && `5:X,L958451:3432920:X,L917259:1963636:X,L023060:3364192:X|OK:2509755,1601664,2584436,683926,2427265,3189475,34`
        && `32920,1963636,3364192` TO rt_cases.
    APPEND `3048396|L848209:3465019:,L799479:374787:X,L458730:1590523:,L392700:1441301:,L665043:2909185:,L651518:3819124:,`
        && `L661063:3391194:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `18543663|L484112:0:,L392917:0:X,L976498:4418747:,L802060:4223481:,L676651:4743570:,L688567:521365:,L084417:0:,`
        && `L866025:4972628:,L713805:3914981:,L198835:578101:|OK:0,0,3505763,3350842,3763473,413643,0,3945203,3106083,4586`
        && `56` TO rt_cases.
    APPEND `18036830|L643769:4430199:X,L496836:3438725:X,L391387:3427220:X,L914765:2105196:|OK:4430199,3438725,3427220,674`
        && `0686` TO rt_cases.
    APPEND `14772670|L842484:296405:,L697313:4183463:,L904376:2922354:X,L915576:1841298:,L966819:2400274:,L776859:1774245:`
        && `,L275628:846330:,L463898:3620235:X,L956090:1513184:,L456688:4433612:,L246324:2507648:|OK:123226,1739212,292235`
        && `4,765492,997878,737616,351849,3620235,629083,1843208,1042517` TO rt_cases.
    APPEND `9543462|L629560:0:X,L817906:1171259:,L714288:4632845:,L502871:4444316:X|OK:0,1029000,4070146,4444316` TO rt_cases.
    APPEND `4759738|L703219:3009182:,L077751:1754570:,L224513:829174:,L681335:1718234:|OK:1959049,1142266,539812,1118611` TO rt_cases.
    APPEND `10991254|L792947:4169544:X,L754414:3571282:,L530480:2751569:|OK:4169544,3853048,2968662` TO rt_cases.
    APPEND `20455420|L252721:4052168:X,L173946:0:,L703888:3714679:,L828958:4076722:X,L393871:3710983:,L407943:1684036:,L38`
        && `1956:3553205:,L073445:4779985:,L418205:2358420:|OK:4052168,0,2312428,4076722,2310127,1048331,2211909,2975593,1`
        && `468142` TO rt_cases.
    APPEND `12812959|L608725:240970:,L696667:2380791:,L808419:4434029:X,L974980:3891628:,L634757:797522:,L883290:3464051:,`
        && `L094853:0:,L912438:1872897:X,L097038:4147342:,L820577:2317923:|OK:90936,898451,4434029,1468604,300965,1307247,`
        && `0,1872897,1565104,874726` TO rt_cases.
    APPEND `644446|L119377:1103894:|OK:644446` TO rt_cases.
    APPEND `29931010|L525927:3433920:,L165656:3064002:,L228080:487733:,L429444:2815092:,L210342:2169592:,L967012:3233643:,`
        && `L588270:2692193:,L604671:3458226:X,L166001:410130:|OK:4965798,4430859,705312,4070910,3137451,4676178,3893186,3`
        && `458226,593090` TO rt_cases.
    APPEND `3420311|L738695:3640154:|OK:3420311` TO rt_cases.
    APPEND `3010359|L585231:332477:,L154465:4475294:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `26439320|L486342:0:X,L139276:45120:,L229793:4934746:,L565422:2377363:,L133221:1251555:,L384961:2831800:,L21153`
        && `8:2583953:X,L755776:2736190:,L119233:4676821:X|OK:0,61039,6675796,3216131,1693122,3830900,2583953,3701558,4676`
        && `821` TO rt_cases.
    APPEND `17196147|L283422:4509735:,L657237:3898614:,L143570:2076878:X,L119636:3095122:,L354101:3051034:X,L400484:189149`
        && `4:|OK:4063060,3512468,2076878,2788560,3051034,1704147` TO rt_cases.
    APPEND `2569309|L776971:3542073:|OK:2569309` TO rt_cases.
    APPEND `1711483|L169670:2155222:,L902711:386395:X|OK:1325088,386395` TO rt_cases.
    APPEND `12935459|L378174:3138390:,L977095:1259008:,L969869:1387730:X,L631218:1953348:,L979923:1557009:,L422666:557923:`
        && `,L265255:662595:,L948525:512512:,L556852:1942967:,L969442:4948601:X,L231213:4909472:,L668242:0:|OK:1255706,503`
        && `744,1387730,781557,622977,223231,265112,205062,777403,4948601,1964336,0` TO rt_cases.
    APPEND `36366585|L168391:1909602:,L193239:3905477:,L590890:170481:,L014344:3219938:,L226771:3577616:X,L774984:2631420:`
        && `,L864995:1469103:,L177351:4085278:,L307995:4705239:,L913462:4363762:,L970227:2504603:|OK:2161716,4421094,19298`
        && `9,3645047,3577616,2978831,1663060,4624633,5326444,4939884,2835271` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_04.
    APPEND `19570095|L581344:3635157:,L680960:4991227:,L249793:4132342:,L384939:0:X,L452432:894172:X,L547322:1130779:X,L94`
        && `5971:981714:,L654567:87643:X,L552978:1521352:,L860552:0:,L322642:2299700:X,L334377:4631043:X|OK:2507335,344267`
        && `8,2850266,0,894172,1130779,677133,87643,1049346,0,2299700,4631043` TO rt_cases.
    APPEND `12132897|L994025:4117687:,L970500:4380998:X|OK:7751899,4380998` TO rt_cases.
    APPEND `7372301|L864568:3931189:,L506685:1469685:X,L711301:0:X,L260062:2286497:|OK:3731983,1469685,0,2170633` TO rt_cases.
    APPEND `16122347|L226000:654051:,L244345:2332475:,L109178:295726:,L343115:3636518:,L613603:0:X,L827285:2477512:,L95838`
        && `8:4572711:,L416185:1613977:X,L702556:0:X|OK:679305,2422538,307145,3776933,0,2573175,4749274,1613977,0` TO rt_cases.
    APPEND `8922356|L483500:2178008:X,L159651:1227899:,L637879:249934:,L928642:3912073:|OK:2178008,1536461,312740,4895147` TO rt_cases.
    APPEND `4915184|L319553:1649754:X,L340099:3675604:,L290126:1909939:|OK:1649754,2148838,1116592` TO rt_cases.
    APPEND `13212844|L123921:4978628:,L048064:4589015:,L824451:1128526:,L446372:0:,L782231:2281014:,L411493:1554800:,L1690`
        && `49:2224271:,L168621:950505:,L707029:2566219:|OK:3244804,2990875,735513,0,1486643,1013336,1449661,619488,167252`
        && `4` TO rt_cases.
    APPEND `21490217|L118686:4889334:,L838469:426671:X,L494709:4397144:X,L911721:1081508:,L904225:3069568:,L218060:3571414`
        && `:,L327584:2288174:X,L233841:1124169:X,L176167:2017715:,L747787:2592050:X,L747505:3970008:,L137596:2376916:|OK:`
        && `2485172,426671,4397144,549714,1560214,1815294,2288174,1124169,1025573,2592050,2017893,1208149` TO rt_cases.
    APPEND `5439655|L007745:4683853:,L290536:1614323:|OK:4045385,1394270` TO rt_cases.
    APPEND `1107360|L849395:0:,L916151:120933:,L080034:3628802:,L604147:4891212:,L135379:2473138:,L559761:2459274:,L873412`
        && `:4581907:,L302251:118550:,L100171:3899885:,L636590:3524241:|OK:0,5211,156370,210769,106571,105974,197441,5109,`
        && `168051,151864` TO rt_cases.
    APPEND `21756132|L999407:2478029:X,L781883:2950429:X,L968580:2284197:,L893628:7445:,L990691:3097980:,L599290:4507873:,`
        && `L716687:2991575:,L915239:4616343:X|OK:2478029,2950429,2075478,6765,2814902,4095966,2718220,4616343` TO rt_cases.
    APPEND `8745786|L049950:601629:,L944475:0:X,L122232:1022743:,L206414:2855023:,L590009:938618:,L091417:168479:,L429900:`
        && `845860:X|OK:850771,0,1446273,4037323,1327311,238248,845860` TO rt_cases.
    APPEND `1847843|L007547:3238226:,L878299:0:X,L076616:2156968:,L884416:1364448:X,L893069:2353440:|OK:202015,0,134562,13`
        && `64448,146818` TO rt_cases.
    APPEND `12977024|L435680:4783875:,L794595:0:,L039708:3189025:X,L765492:789073:,L478451:4363041:,L040929:0:,L306224:689`
        && `842:X|OK:4380485,0,3189025,722536,3995136,0,689842` TO rt_cases.
    APPEND `5695663|L596254:4758608:X,L918464:3309805:,L818048:3404382:,L035774:1998363:,L720381:4054025:,L244387:930474:X`
        && `,L423098:4682463:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `16138921|L364204:1415095:X,L955749:3815799:,L344508:1934160:,L924247:1067576:,L711120:4163833:X,L872340:299256`
        && `0:,L549268:4683248:,L566616:2597164:X|OK:1415095,2096449,1062652,586540,4163833,1644151,2573037,2597164` TO rt_cases.
    APPEND `2957908|L556576:2306696:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `1599596|L410830:996361:,L619656:1098010:X,L886589:446539:|OK:346359,1098010,155227` TO rt_cases.
    APPEND `14164845|L498768:916376:,L433622:2991200:,L172179:1746044:,L452247:0:X,L832676:3881261:|OK:1361352,4443672,259`
        && `3891,0,5765930` TO rt_cases.
    APPEND `29442537|L154291:3696808:X,L765713:914848:,L515664:2565101:,L215911:2661774:,L718385:3837946:,L145341:1445047:`
        && `,L024592:0:,L872727:1295924:,L145315:3680391:X,L857265:2268920:,L513883:0:X,L995296:1329344:X|OK:3696808,12655`
        && `66,3548464,3682198,5309270,1999024,0,1792733,3680391,3138739,0,1329344` TO rt_cases.
    APPEND `13089679|L734431:504841:X,L377543:3915695:X,L832893:0:,L050158:3974533:,L148112:1874052:X,L061638:0:,L106084:1`
        && `774470:,L076491:1943078:,L939826:2002220:|OK:504841,3915695,0,2785896,1874052,0,1243791,1361975,1403429` TO rt_cases.
    APPEND `13155112|L372570:2880062:X,L687851:2166278:,L918709:4211376:,L280553:3465484:|OK:2880062,2261333,4396169,36175`
        && `48` TO rt_cases.
    APPEND `18709078|L911633:1781847:X,L840030:1868429:,L824543:4330575:X,L895765:409871:X,L980973:3200097:,L651534:115411`
        && `3:,L073926:4250681:|OK:1781847,2174109,4330575,409871,3723642,1342929,4946105` TO rt_cases.
    APPEND `22199162|L613289:871851:,L856299:851990:,L450449:1271044:,L461790:0:,L322934:0:,L727735:3505855:,L913756:23277`
        && `72:,L365031:3107743:X,L649293:4655649:|OK:1234402,1206282,1799595,0,0,4963731,3295753,3107743,6591656` TO rt_cases.
    APPEND `3580804|L538177:2696122:|OK:3580804` TO rt_cases.
    APPEND `18473969|L118914:0:X,L010751:89299:X,L665862:4900059:,L176535:640876:,L297313:1597883:,L606021:108094:,L899290`
        && `:2092034:,L939095:527766:,L282602:4924351:X,L311595:1230031:,L159590:245099:|OK:0,89299,5815313,760582,1896342`
        && `,128284,2482793,626344,4924351,1459781,290880` TO rt_cases.
    APPEND `13171219|L668142:4898927:,L553904:1795895:X,L977521:208773:,L412438:3421000:|OK:6534042,1795895,278455,4562827` TO rt_cases.
    APPEND `14467265|L441893:2075703:,L806246:1990387:,L775015:0:,L479804:1334917:,L661551:599449:,L619938:494220:,L696059`
        && `:2267916:X,L249511:992459:,L758093:3402927:,L958979:1297243:|OK:2077754,1992354,0,1336236,600041,494709,226791`
        && `6,993440,3406290,1298525` TO rt_cases.
    APPEND `14109790|L215924:358292:,L400995:2710197:,L082161:2235338:,L378305:2367755:,L743867:31767:,L690604:4649573:,L0`
        && `03413:743794:,L265671:1000636:,L694121:2041028:,L714882:1183472:|OK:291852,2207634,1820830,1928693,25876,37873`
        && `84,605869,815084,1662552,964016` TO rt_cases.
    APPEND `1422093|L268105:1179738:,L852288:1323409:|OK:670235,751858` TO rt_cases.
    APPEND `21608125|L871817:0:,L682057:1469996:,L063989:1073618:,L271837:3596961:X,L003100:3740385:X,L190515:2172396:,L93`
        && `8797:1671259:X,L276872:405458:,L426412:5922:,L333601:3607699:X,L162533:3878140:X,L020733:0:|OK:0,1466066,10707`
        && `47,3596961,3740385,2166588,1671259,404374,5906,3607699,3878140,0` TO rt_cases.
    APPEND `2542217|L914374:2255311:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `909282|L836302:3678525:,L247068:36778:,L432122:4964272:,L157290:1826631:X,L125587:0:X,L835473:3493465:,L437279`
        && `:348012:,L152081:1919683:,L750410:1322654:,L692304:2882582:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `25778587|L891439:3904172:X,L243381:2261849:,L931098:1169173:X,L419938:3496811:,L435500:0:,L822374:3893693:X,L7`
        && `96501:655591:X,L414324:1811506:|OK:3904172,4827151,1169173,7462760,0,3893693,655591,3866047` TO rt_cases.
    APPEND `7339441|L377809:1586941:,L170397:4867361:|OK:1804573,5534868` TO rt_cases.
    APPEND `9427532|L185573:1068479:X,L706793:1172762:,L151852:149500:,L378202:0:X,L993598:0:X,L263853:3436044:X,L220574:1`
        && `819406:,L552963:1717743:,L584873:4062190:,L108089:3820161:,L859455:3481299:,L909583:1601146:X|OK:1068479,24013`
        && `7,30612,0,0,3436044,372545,351728,831781,782223,712837,1601146` TO rt_cases.
    APPEND `3884978|L263124:471788:,L559606:3641220:|OK:445632,3439346` TO rt_cases.
    APPEND `22174637|L132599:3590537:X,L811715:796813:,L754719:1604290:X,L046201:4557307:X,L920224:4850319:,L762996:529942`
        && `:,L768313:442928:,L484486:1487657:X,L540221:0:X|OK:3590537,1316167,1604290,4557307,8011703,875352,731624,14876`
        && `57,0` TO rt_cases.
    APPEND `11796844|L992526:3668564:,L647127:4688301:,L335371:0:|OK:5178674,6618170,0` TO rt_cases.
    APPEND `9212875|L389846:2385671:,L991762:4621110:X,L463406:2888203:,L613476:293916:|OK:1967467,4621110,2381905,242393` TO rt_cases.
    APPEND `15417708|L560537:0:,L487802:0:,L520874:4383806:X,L362972:1299807:,L087192:837708:X,L865573:2593996:,L765296:26`
        && `24872:,L060344:3335979:,L176282:4330533:,L938537:2390448:,L858624:953728:,L675782:949760:|OK:0,0,4383806,71719`
        && `2,837708,1431285,1448321,1840687,2389451,1318973,526237,524048` TO rt_cases.
    APPEND `6464646|L130701:2518621:,L354484:3392163:,L795760:3335773:,L040644:3281971:,L724328:700306:,L149465:1430793:,L`
        && `530370:4914557:X,L427165:1893289:,L472503:3146012:|OK:198188,266926,262489,258255,55106,112588,4914557,148981,`
        && `247556` TO rt_cases.
    APPEND `23204920|L179801:3755342:,L251999:1744496:,L551458:0:,L698276:3357864:,L028435:1773858:,L788979:0:X,L460580:29`
        && `15188:X,L405895:4837364:,L845936:1496913:X|OK:4562273,2119346,0,4079387,2155017,0,2915188,5876796,1496913` TO rt_cases.
    APPEND `8557194|L895421:1861035:,L886895:1233311:,L842412:198666:,L459593:4135665:|OK:2143751,1420668,228846,4763929` TO rt_cases.
    APPEND `6839|L396534:5877:|OK:6839` TO rt_cases.
    APPEND `10013621|L882153:1977115:X,L678158:3647609:,L537717:4737090:|OK:1977115,3496134,4540372` TO rt_cases.
    APPEND `22760481|L474573:730148:,L472001:4979809:,L631318:2857098:,L746468:3725391:X,L099201:1678580:,L555496:2917699:`
        && `|OK:1055844,7201148,4131561,3725391,2427343,4219194` TO rt_cases.
    APPEND `8673613|L606894:4093906:X,L802514:538280:,L675608:2729214:X|OK:4093906,1850493,2729214` TO rt_cases.
    APPEND `6959382|L869722:4015642:,L524145:2241792:|OK:4466110,2493272` TO rt_cases.
    APPEND `5647077|L534008:3670845:,L598454:814851:|OK:4621255,1025822` TO rt_cases.
    APPEND `38585698|L177783:1769169:,L320864:3719542:,L406830:1538891:,L850739:4063369:,L996203:2385390:X,L969217:3157121`
        && `:,L079420:574356:,L595166:4768094:X,L999148:3763068:X,L764971:3965029:,L284104:959357:,L051404:1735802:X|OK:23`
        && `23434,4884842,2021012,5336387,2385390,4146219,754297,4768094,3763068,5207238,1259915,1735802` TO rt_cases.
    APPEND `2255564|L130159:4103482:,L376242:2845029:,L728576:4422528:|OK:813968,564341,877255` TO rt_cases.
    APPEND `10033711|L618578:3398195:,L926242:0:X,L858229:4510778:,L492155:116921:,L387633:1358579:,L598884:327348:,L08574`
        && `1:1396880:,L416732:1144687:,L633862:1759870:,L025242:3919828:|OK:1901318,0,2523818,65418,760136,183154,781566,`
        && `640462,984662,2193177` TO rt_cases.
    APPEND `28791198|L602664:0:X,L543401:3777:,L856352:59114:,L497118:3579702:,L226360:4259013:,L959822:2874394:,L509294:3`
        && `586331:X,L048859:2379757:,L444409:584679:,L770744:2838421:X|OK:0,6148,96225,5826978,6932748,4678889,3586331,38`
        && `73728,951730,2838421` TO rt_cases.
    APPEND `16183624|L827917:3872656:,L270272:1066420:,L948299:2881120:,L702604:3174479:,L181291:4717434:,L666176:2941101:`
        && `|OK:3359937,925231,2499675,2754195,4092871,2551715` TO rt_cases.
    APPEND `10027255|L467604:3688051:,L983528:4414957:,L263181:2594527:,L381343:1106670:X|OK:3075435,3681596,2163554,11066`
        && `70` TO rt_cases.
    APPEND `9405981|L950549:49187:,L196939:4512140:,L636140:2494039:,L577815:1361903:,L722376:4311345:,L319780:1584791:,L0`
        && `67388:597711:|OK:31027,2846273,1573248,859093,2719611,999691,377038` TO rt_cases.
    APPEND `4822423|L705506:0:,L206854:1359075:,L563037:2481248:X,L196242:1542003:,L810900:373624:|OK:0,971640,2481248,110`
        && `2421,267114` TO rt_cases.
    APPEND `16041967|L784880:4482495:X,L377478:1738800:,L637180:1268847:,L327676:4692961:,L845247:2030558:X,L327603:106662`
        && `9:,L953925:876190:|OK:4482495,1718152,1253780,4637233,2030558,1053963,865786` TO rt_cases.
    APPEND `10946092|L891564:2234874:,L555448:2552728:X,L675499:270225:,L769892:3246620:X,L565914:1853352:X,L319272:643190`
        && `:X|OK:2364325,2552728,285877,3246620,1853352,643190` TO rt_cases.
    APPEND `15611710|L495537:4093475:X,L334945:805763:,L751077:3065533:,L801556:3715219:X,L103039:1332304:,L663412:1084943`
        && `:,L848306:314952:|OK:4093475,952130,3622385,3715219,1574316,1282022,372163` TO rt_cases.
    APPEND `6353216|L773391:789882:,L060007:294738:,L699888:2893574:,L464968:1234840:,L197151:0:X,L533724:878672:|OK:82379`
        && `1,307391,3017792,1287850,0,916392` TO rt_cases.
    APPEND `0|L571126:0:|OK:0` TO rt_cases.
    APPEND `11736732|L751543:1651939:,L968150:2995856:,L132946:4006829:,L468173:4149268:,L662689:6406:,L011958:334517:,L34`
        && `0640:3005579:,L837082:4004980:|OK:961945,1744525,2333228,2416172,3730,194794,1750187,2332151` TO rt_cases.
    APPEND `6883805|L535475:577921:,L243475:4122138:X,L692180:1234078:,L836835:1338489:,L991419:1361675:,L967813:1124105:|`
        && `OK:283171,4122138,604675,655835,667195,550791` TO rt_cases.
    APPEND `18575470|L127352:4989268:X,L554986:4871080:,L158269:2730664:,L329170:3837211:X,L999623:3844763:,L899168:223718`
        && `6:,L113839:0:,L458226:3270089:,L164713:3638284:,L505020:1348199:,L323615:2498364:,L053828:631658:|OK:4989268,1`
        && `894199,1061863,3837211,1495099,869966,0,1271628,1414806,524269,971530,245631` TO rt_cases.
    APPEND `15578323|L416296:3397983:,L274172:2853025:,L891431:4788091:,L160516:0:,L861126:174458:,L351202:4595764:X,L4773`
        && `96:1492991:,L720496:1904937:|OK:2554056,2144444,3598915,0,131129,4595764,1122190,1431825` TO rt_cases.
    APPEND `34599900|L577839:3979487:,L017215:0:,L729181:4770913:,L734096:1348080:,L893706:4570505:X,L971854:419478:,L5559`
        && `39:3490931:,L039656:1342728:,L375535:2325201:,L110878:1056174:|OK:6379204,0,7647878,2161002,4570505,672432,559`
        && `6039,2152422,3727348,1693070` TO rt_cases.
    APPEND `1637452|L232757:1546005:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `30083261|L113333:2185073:,L866079:4693726:,L828640:4131171:,L021637:1419228:,L157489:4524818:X,L097850:3537949`
        && `:X,L121515:80770:,L434062:1935059:|OK:3331000,7155277,6297699,2163520,4524818,3537949,123128,2949870` TO rt_cases.
    APPEND `27736251|L836496:2397342:X,L283284:0:,L757543:4017831:,L008600:670012:X,L193394:2992768:,L512359:4041053:,L089`
        && `171:2165695:,L673194:3494671:|OK:2397342,0,5930789,670012,4417676,5965068,3196820,5158544` TO rt_cases.
    APPEND `13316718|L803342:3837118:X,L972896:1107079:,L126460:4206250:,L464721:2550762:,L994671:0:X,L156180:1038179:X,L5`
        && `11123:2773227:,L556076:2211500:,L906552:0:X,L969429:970447:,L603250:1120031:|OK:3837118,625553,2376734,1441303`
        && `,0,1038179,1567007,1249604,0,548349,632871` TO rt_cases.
    APPEND `6710233|L526538:1167610:,L728043:0:X,L018585:0:,L743377:1901834:,L231455:3411187:,L218701:3474176:|OK:787050,0`
        && `,0,1281969,2299378,2341836` TO rt_cases.
    APPEND `10153036|L804827:3127419:,L192904:4350480:X,L797661:1681301:X,L452844:4504640:X,L794769:3499335:X|ERR:BELOW_LO`
        && `CKED_TOTAL` TO rt_cases.
    APPEND `26617393|L306257:1689412:,L886928:586811:,L042272:418079:,L219501:0:,L638138:2134447:,L897724:4429244:X,L87127`
        && `2:2369623:,L693050:2397888:,L591984:4323917:,L821230:1969681:X,L716393:3194971:,L840760:3785048:|OK:1634306,56`
        && `7670,404442,0,2064825,4429244,2292330,2319673,4182879,1969681,3090757,3661586` TO rt_cases.
    APPEND `29728469|L194899:2035660:X,L813174:2952243:X,L512005:57371:X,L183005:1815753:X,L123896:2090036:,L630316:282135`
        && `9:,L871163:971747:X,L802006:23680:,L400675:3580707:,L535733:0:,L400462:222343:,L628691:4571022:X|OK:2035660,29`
        && `52243,57371,1815753,4143817,5593777,971747,46949,7099301,0,440829,4571022` TO rt_cases.
    APPEND `13258052|L408951:1045989:,L284516:2223790:,L156519:384576:,L163010:3384662:,L307705:1152603:,L132697:1500085:X`
        && `,L658994:0:,L639045:1040927:|OK:1332103,2832073,489771,4310484,1467880,1500085,0,1325656` TO rt_cases.
    APPEND `29602857|L479239:1586420:,L758100:2984702:,L752146:3343615:,L775524:1826936:,L181495:2354641:,L696193:4271751:`
        && `X,L920939:2014259:,L341953:4512389:,L677975:4379789:|OK:1746999,3286816,3682058,2011860,2592979,4271751,221814`
        && `4,4969136,4823114` TO rt_cases.
    APPEND `1526302|L510313:4604784:|OK:1526302` TO rt_cases.
    APPEND `13878076|L757280:0:X,L126188:0:X,L814182:1343256:X,L344806:3443409:,L515528:3416129:X,L289632:4896185:,L862045`
        && `:4282819:|OK:0,0,1343256,2487589,3416129,3537105,3093997` TO rt_cases.
    APPEND `10867825|L339211:2702117:X,L218790:82238:,L278645:2484023:,L173697:3459921:X|OK:2702117,150801,4554986,3459921` TO rt_cases.
    APPEND `5529269|L539660:3330435:,L892956:0:,L688800:694327:,L013617:4354029:|OK:2197796,0,458195,2873278` TO rt_cases.
    APPEND `22947490|L701073:2541086:,L447059:2461120:,L830362:0:X,L844838:1471320:,L728722:3348465:X,L238577:1919673:,L40`
        && `5086:2556276:X,L094042:1990023:,L593310:611638:,L168556:0:|OK:3938849,3814896,0,2280642,3348465,2975618,255627`
        && `6,3084665,948079,0` TO rt_cases.
    APPEND `9553809|L626554:4354213:,L774212:2397005:X,L652823:1026257:X,L659562:3129760:|OK:3566783,2397005,1026257,25637`
        && `64` TO rt_cases.
    APPEND `2878836|L698161:4845020:,L873142:4504571:|OK:1491832,1387004` TO rt_cases.
    APPEND `10138984|L547913:862165:,L740299:0:X,L501153:2839520:,L546452:0:X,L241716:3553688:,L964702:2143292:,L134880:12`
        && `73626:,L671459:1811487:X,L554915:2866017:,L789638:1976992:|OK:462748,0,1524050,0,1907364,1150365,683591,181148`
        && `7,1538272,1061107` TO rt_cases.
    APPEND `20520945|L318448:2484830:X,L771115:3871499:,L722341:2952907:X,L376207:2732600:,L244045:3726762:,L459871:695371`
        && `:,L083417:2541395:X,L037901:4783674:|OK:2484830,3071215,2952907,2167739,2956397,551630,2541395,3794832` TO rt_cases.
    APPEND `15277193|L437904:886316:X,L764312:2112819:,L666120:2297028:,L009879:2381021:,L946420:1616914:X,L293396:339967:`
        && `,L897548:2833449:|OK:886316,2708581,2944733,3052409,1616914,435829,3632411` TO rt_cases.
    APPEND `4544685|L086343:3471901:|OK:4544685` TO rt_cases.
    APPEND `1933040|L903770:3267656:|OK:1933040` TO rt_cases.
    APPEND `17232905|L865822:2063459:X,L061592:3177694:,L969483:0:,L985969:1666299:X,L544768:2950951:,L294461:4080288:,L23`
        && `8970:2205879:,L662227:1127870:,L944527:4402969:,L249250:338486:,L326935:1425292:X,L497404:4244293:X|OK:2063459`
        && `,1361435,0,1666299,1264290,1748138,945076,483219,1886385,145019,1425292,4244293` TO rt_cases.
    APPEND `2747985|L743685:4941320:X,L517849:1737712:,L054924:323053:X,L020359:0:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `7455963|L413126:3642702:,L214063:1797257:|OK:4992657,2463306` TO rt_cases.
    APPEND `11752227|L533795:1104694:,L904000:3544076:,L011940:3923454:,L757244:2226295:|OK:1202259,3857083,4269967,242291`
        && `8` TO rt_cases.
    APPEND `46660830|L707958:1271058:,L948752:2189724:,L593934:4708645:X,L964704:4009465:,L683404:824671:,L175609:2623946:`
        && `,L651752:4905407:,L244486:3111646:X,L079442:1347480:,L260490:4708863:,L857619:1761097:,L483413:585530:X|OK:205`
        && `6718,3543225,4708645,6487776,1334412,4245847,7937513,3111646,2180378,7619482,2849658,585530` TO rt_cases.
    APPEND `17700766|L991552:1745222:,L507743:3979189:,L772514:1320672:,L827978:3505939:,L347983:0:,L279184:265267:,L10216`
        && `8:4573047:|OK:2007349,4576851,1519033,4032520,0,305109,5259904` TO rt_cases.
    APPEND `15705985|L746173:4270771:X,L643163:4835951:,L666149:450076:,L417351:4058364:,L788681:313746:|OK:4270771,572575`
        && `6,532889,4805094,371475` TO rt_cases.
    APPEND `41298047|L232730:4890459:,L454999:2948229:,L149172:2958394:,L821155:4664636:,L473471:0:,L194506:3027770:,L5804`
        && `10:2678614:X,L267865:214667:,L372537:2614470:,L427693:3561232:,L335486:2992093:X|OK:7003016,4221791,4236347,66`
        && `79644,0,4335692,2678614,307398,3743856,5099596,2992093` TO rt_cases.
    APPEND `1127053|L314813:635733:,L355296:962377:|OK:448345,678708` TO rt_cases.
    APPEND `2893744|L907899:3511277:|OK:2893744` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_05.
    APPEND `22374093|L843504:3212110:,L605359:3782100:,L956368:2464634:,L347818:1735259:,L431873:904668:,L808711:3003038:,`
        && `L895834:4672958:,L326513:2919220:|OK:3166832,3728788,2429892,1710799,891916,2960707,4607088,2878071` TO rt_cases.
    APPEND `29477415|L378519:4878657:,L010293:1393975:X,L383090:86367:,L848766:264377:,L241279:3665866:,L332429:2684074:,L`
        && `041570:4222186:,L702551:2295341:,L757498:337015:|OK:7432480,1393975,131578,402770,5584831,4089102,6432367,3496`
        && `880,513432` TO rt_cases.
    APPEND `17492131|L234173:0:,L767704:0:,L185941:1810171:,L689455:2837759:,L853890:3547058:,L997664:4266337:|OK:0,0,2540`
        && `962,3983401,4979053,5988715` TO rt_cases.
    APPEND `382752|L386229:361948:|OK:382752` TO rt_cases.
    APPEND `7355437|L175851:227476:X,L910946:4080254:,L792762:3010767:,L089163:4302673:|OK:227476,2552631,1883553,2691777` TO rt_cases.
    APPEND `9786919|L998221:4846285:,L065917:3242246:,L914832:3161726:,L858444:1536899:,L476093:4186283:|OK:2794378,186948`
        && `5,1823058,886179,2413819` TO rt_cases.
    APPEND `10180371|L246584:4754904:,L921445:4875720:,L414373:0:X|OK:5026329,5154042,0` TO rt_cases.
    APPEND `13666794|L998654:0:,L904651:14572:,L829057:0:X,L032680:1094918:X,L297970:4060947:,L501591:664140:,L396412:4313`
        && `530:,L179010:627974:,L718313:4236680:X,L976066:1636738:,L527743:1073114:,L528034:2038069:|OK:0,8418,0,1094918,`
        && `2345872,383651,2491781,362760,4236680,945488,619902,1177324` TO rt_cases.
    APPEND `11453954|L485941:3559664:,L226677:4634373:,L740132:4211640:,L498290:1721705:,L240756:1698459:|OK:2576307,33541`
        && `28,3048175,1246084,1229260` TO rt_cases.
    APPEND `10010534|L823185:2445200:,L521978:0:,L985375:4612602:,L727211:332597:|OK:3312102,0,6247918,450514` TO rt_cases.
    APPEND `12561745|L354240:2172768:,L552421:3769378:,L838716:3455358:,L242827:3580186:X,L980949:1845832:,L651770:3326590`
        && `:,L080308:0:|OK:1339392,2323615,2130038,3580186,1137854,2050660,0` TO rt_cases.
    APPEND `8385450|L143378:4723997:X,L449170:656846:X,L078942:4949952:X,L012406:3106541:,L883866:4450793:|ERR:BELOW_LOCKE`
        && `D_TOTAL` TO rt_cases.
    APPEND `33329274|L143674:3249409:X,L253677:924557:,L020612:3740740:X,L145768:193150:X,L984375:1617462:,L191244:4332495`
        && `:,L152557:2443123:,L554082:3231041:,L843634:1604517:,L050176:0:,L838731:927934:|OK:3249409,1602894,3740740,193`
        && `150,2804175,7511195,4235613,5601618,2781732,0,1608748` TO rt_cases.
    APPEND `6566851|L839272:402402:X,L761371:3573063:,L000008:792196:,L574374:1243747:|OK:402402,3926893,870645,1366911` TO rt_cases.
    APPEND `21946636|L643739:1705912:,L763070:3126049:,L000074:2553309:X,L943667:3756323:,L562539:1116350:,L382147:0:X,L00`
        && `4016:3065297:X|OK:2870194,5259572,2553309,6320007,1878257,0,3065297` TO rt_cases.
    APPEND `13667288|L876539:3033803:X,L696325:2630831:X,L942840:3915769:|OK:3033803,2630831,8002654` TO rt_cases.
    APPEND `11486339|L107265:2746283:,L869207:4522114:,L021918:2020240:X,L442345:2320896:,L911299:1605040:X,L768205:314076`
        && `5:,L034999:668984:X,L828611:634222:|OK:1477930,2433605,2020240,1249006,1605040,1690223,668984,341311` TO rt_cases.
    APPEND `29766064|L752834:2682547:,L414564:3465891:,L729166:2622538:,L022354:305573:X,L608205:0:,L597862:0:,L114427:232`
        && `5625:,L486379:4106172:,L689204:4882207:,L858501:0:X|OK:3934739,5083742,3846718,305573,0,0,3411208,6022901,7161`
        && `183,0` TO rt_cases.
    APPEND `36520932|L691352:4308923:,L678323:4809934:,L343300:580812:,L345011:2451193:X,L916745:3175522:,L132399:890033:,`
        && `L054708:2062556:,L832111:4957870:,L846893:4632304:|OK:5775598,6447143,778509,2451193,4256409,1192983,2764611,6`
        && `645434,6209052` TO rt_cases.
    APPEND `14015170|L985220:4560696:,L259680:1491476:X,L273539:1649141:,L268326:2605779:,L466256:2923384:,L166276:3130414`
        && `:,L608168:1409945:,L660828:687608:|OK:3366351,1491476,1217267,1923383,2157814,2310628,1040712,507539` TO rt_cases.
    APPEND `2283759|L373212:722328:X,L879646:1700211:|OK:722328,1561431` TO rt_cases.
    APPEND `1554449|L090858:2100754:,L014590:465520:,L222478:26762:|OK:1259340,279066,16043` TO rt_cases.
    APPEND `20296209|L241119:3592382:,L881098:2327617:X,L631468:3544784:,L669255:4509601:,L657802:4151109:,L519771:0:X,L10`
        && `1312:1836216:,L867899:3677354:,L809313:4262271:|OK:2524078,2327617,2490634,3168533,2916650,0,1290161,2583781,2`
        && `994755` TO rt_cases.
    APPEND `3684552|L675714:4496795:,L383323:1228797:,L433894:35071:|OK:2876175,785945,22432` TO rt_cases.
    APPEND `22110171|L911094:1036010:,L995366:1540755:,L865633:0:,L440889:0:,L420075:370215:,L427215:1604871:X,L006563:949`
        && `886:X,L964163:1546810:,L601888:4382826:,L345353:316787:,L882307:3579275:,L085458:2272651:X|OK:1401829,2084802,`
        && `0,0,500939,1604871,949886,2092995,5930420,428646,4843132,2272651` TO rt_cases.
    APPEND `1469564|L599704:2320842:X,L196674:1512839:X,L677043:4630101:,L706611:1573456:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `34480121|L727252:4082897:X,L008083:812323:,L744313:313035:X,L804235:2419552:,L495214:2508822:,L035372:697005:,`
        && `L237950:1708475:,L854435:1506227:,L464173:3635559:,L666729:2216988:,L655667:4638455:X,L939610:4549166:|OK:4082`
        && `897,1030719,313035,3070057,3183327,884397,2167804,1911181,4612991,2813033,4638455,5772225` TO rt_cases.
    APPEND `12636200|L798644:3191714:,L565859:3151111:,L789384:180322:,L572086:2863942:,L082718:2662317:,L234509:2734184:,`
        && `L644317:2523484:,L993746:3654798:,L717570:3721869:X|OK:1357321,1340054,76685,1217932,1132188,1162750,1073147,1`
        && `554254,3721869` TO rt_cases.
    APPEND `24701718|L174824:2474150:X,L790132:1168182:,L094403:2208246:X,L828831:4344667:X,L285281:2961776:,L393309:15314`
        && `98:X,L977878:4363616:,L352138:2852157:,L583123:1764543:|OK:2474150,1260217,2208246,4344667,3195117,1531498,470`
        && `7400,3076862,1903561` TO rt_cases.
    APPEND `19131527|L669084:2495687:,L021317:1809512:,L954366:2281383:,L838380:0:X,L615748:4228993:X,L350607:0:,L105271:2`
        && `930540:|OK:3907910,2833453,3572339,0,4228993,0,4588832` TO rt_cases.
    APPEND `10981659|L055985:2232030:,L331537:2579389:,L547465:2332164:,L802602:3524782:X,L224238:4932160:|OK:1378298,1592`
        && `795,1440132,3524782,3045652` TO rt_cases.
    APPEND `1772954|L536207:1189582:|OK:1772954` TO rt_cases.
    APPEND `11210736|L384934:2097323:,L641236:4232398:X,L842208:4667568:X,L474379:0:,L206535:0:,L565218:0:,L644800:2962023`
        && `:X,L120667:4109413:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `2308176|L205637:3281103:,L136477:0:|OK:2308176,0` TO rt_cases.
    APPEND `21396383|L406564:3057161:,L884691:4004896:,L063273:3259116:,L308193:973211:,L345131:3046808:X,L058759:447701:,`
        && `L271053:479726:,L762915:1034570:,L120672:1973211:,L655043:3784982:|OK:2950243,3864832,3145135,939175,3046808,4`
        && `32043,462948,998388,1904202,3652609` TO rt_cases.
    APPEND `20005992|L034964:836054:X,L707773:3916748:X,L886212:4792695:,L374514:1707067:X,L399855:4123390:,L272490:159926`
        && `1:X,L551061:3910432:,L198854:0:X,L056029:4412544:|OK:836054,3916748,3321391,1707067,2857556,1599261,2709973,0,`
        && `3057942` TO rt_cases.
    APPEND `8322143|L485992:2259658:,L714381:4350202:X,L365748:1250263:X,L332476:0:,L488736:2948920:|OK:1180756,4350202,12`
        && `50263,0,1540922` TO rt_cases.
    APPEND `9438454|L266097:2258381:X,L688285:1008010:X,L110396:2837152:,L972427:1810274:,L418031:0:|OK:2258381,1008010,37`
        && `67910,2404153,0` TO rt_cases.
    APPEND `9983232|L161265:1584128:,L335591:2472702:X,L601408:4113249:,L994116:3794979:X,L359349:1530615:X,L177502:428380`
        && `:X|OK:488402,2472702,1268154,3794979,1530615,428380` TO rt_cases.
    APPEND `36203823|L692143:3739657:,L774650:3225495:,L652049:4870709:X,L672824:1384890:,L358040:3717136:,L507532:127069:`
        && `X,L233204:4083310:,L198443:1632070:X,L191886:1900104:|OK:6127030,5284631,4870709,2268995,6090132,127069,669006`
        && `9,1632070,3113118` TO rt_cases.
    APPEND `10718100|L162521:649924:,L258146:3399637:,L673571:4447805:,L635654:2272001:,L297721:2895579:|OK:509768,2666505`
        && `,3488636,1782044,2271147` TO rt_cases.
    APPEND `5484588|L154349:859908:,L134512:4650693:|OK:855849,4628739` TO rt_cases.
    APPEND `43060932|L073926:3736836:X,L362338:3455236:,L724253:206139:X,L961758:347442:,L417570:4816413:,L029383:4658986:`
        && `,L866716:4573057:,L514234:3295557:X,L555637:4521382:,L131208:1767058:|OK:3736836,5127466,206139,515593,7147412`
        && `,6913795,6786279,3295557,6709594,2622261` TO rt_cases.
    APPEND `15581777|L486133:2297052:,L183593:2611742:X,L096764:2805445:,L800421:1217700:,L137221:2835995:X,L710093:342127`
        && `1:,L643430:969191:,L212413:1389993:,L338596:3325620:|OK:1509011,2611742,1842992,799948,2835995,2247549,636694,`
        && `913134,2184712` TO rt_cases.
    APPEND `13083347|L683352:3694301:X,L765562:1180755:,L460114:4802838:,L651320:3365270:|OK:3694301,1185830,4823481,33797`
        && `35` TO rt_cases.
    APPEND `12200536|L125276:309916:,L230717:606106:,L980166:4184354:,L867016:3746992:,L191006:1627081:,L205222:3323138:,L`
        && `496498:956224:,L585120:1277005:|OK:235867,461288,3184577,2851714,1238319,2529133,727751,971887` TO rt_cases.
    APPEND `3413249|L174302:0:X,L558547:3595135:,L042363:2205336:X|OK:0,1207913,2205336` TO rt_cases.
    APPEND `5949187|L920175:3183792:,L273599:683180:,L590996:0:,L013915:4485362:,L117663:220560:,L115158:2673748:,L233229:`
        && `719574:,L039444:2276405:,L007615:3645071:X,L744749:4799855:,L225644:0:X|OK:385235,82664,0,542723,26687,323520,`
        && `87068,275442,3645071,580777,0` TO rt_cases.
    APPEND `27659395|L340239:1397749:X,L760108:623187:,L162585:1933661:,L263422:4973416:X,L576614:2345711:,L076792:4530635`
        && `:,L036395:3395457:|OK:1397749,1034134,3208772,4973416,3892540,7518265,5634519` TO rt_cases.
    APPEND `17425210|L091718:1830263:,L075930:3144386:X,L976519:983770:,L757327:1789424:,L568943:0:X,L850203:3552540:,L363`
        && `513:1731280:,L408331:183316:X,L905356:2976698:,L305468:3271629:,L264769:4742511:|OK:1235846,3144386,664270,120`
        && `8271,0,2398778,1169010,183316,2009953,2209099,3202281` TO rt_cases.
    APPEND `13793025|L701216:376533:,L317022:1603063:X,L672448:0:,L101204:3861720:X,L928861:2646009:X,L764308:1118678:X|OK`
        && `:4563555,1603063,0,3861720,2646009,1118678` TO rt_cases.
    APPEND `1466814|L424040:0:,L604449:1347889:,L792395:0:X|OK:0,1466814,0` TO rt_cases.
    APPEND `8346434|L731645:4046153:,L933287:288078:,L007411:1166369:,L648504:659667:X,L271895:1480965:,L533437:3114810:X,`
        && `L826688:0:X|OK:2649669,188651,763810,659667,969827,3114810,0` TO rt_cases.
    APPEND `25108615|L640183:0:X,L239331:3463652:X,L683849:3348425:,L147648:3558351:,L213832:3441331:,L777680:2986387:X,L9`
        && `44135:3551025:|OK:0,3463652,4495018,4776828,4619737,2986387,4766993` TO rt_cases.
    APPEND `4491290|L862417:3638228:,L505559:692044:,L794372:2883753:|OK:2265079,430851,1795360` TO rt_cases.
    APPEND `11412032|L831337:4172823:,L167440:1154135:X,L970195:1437411:X,L551840:4833795:X,L040665:677374:,L745693:268241`
        && `7:|OK:2208497,1154135,1437411,4833795,358505,1419689` TO rt_cases.
    APPEND `7785457|L066310:3301462:,L418105:2168444:,L144704:3971890:X,L875486:4600385:X,L776725:648709:,L226396:0:X,L367`
        && `042:516259:X,L998569:1959220:,L041200:1839020:X,L592600:3792811:,L183775:1838367:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `34385183|L113825:3661443:X,L523436:2468517:,L441393:3790218:,L709994:4976115:,L315799:3390847:,L536445:637840:`
        && `,L851002:0:,L625605:1533834:,L623105:4425682:,L298908:1682315:|OK:3661443,3311105,5083947,6674630,4548257,8555`
        && `56,0,2057383,5936316,2256546` TO rt_cases.
    APPEND `10066354|L955189:3904610:,L261966:0:,L384654:2937765:|OK:5744378,0,4321976` TO rt_cases.
    APPEND `29437602|L341302:199715:,L106991:3180779:,L794977:4871525:,L187423:0:,L600604:3563439:,L463513:2491510:,L97797`
        && `4:1464821:,L613056:3706353:,L911258:3181286:,L105071:2562911:,L616160:1346807:,L041013:225036:X|OK:219585,3497`
        && `241,5356203,0,3917973,2739396,1610559,4075106,3497799,2817900,1480804,225036` TO rt_cases.
    APPEND `9539488|L645996:1725249:,L508946:2942568:,L824897:1270425:X,L134617:844434:|OK:2588088,4414219,1270425,1266756` TO rt_cases.
    APPEND `11029163|L583071:974403:,L003337:993837:X,L504196:3536791:,L094932:3981950:X|OK:1307509,993837,4745867,3981950` TO rt_cases.
    APPEND `4416496|L841589:2717335:,L946091:2037267:,L271084:3722744:,L615965:0:,L553378:1431283:X,L560709:3554850:X,L815`
        && `823:1925238:,L113011:2305625:,L880981:718706:,L314921:592127:,L868904:694317:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `10414672|L947907:4765502:,L398519:3874154:,L400134:1330624:X|OK:5010622,4073426,1330624` TO rt_cases.
    APPEND `26935994|L309903:2417915:,L240336:1716015:,L449611:2990542:,L710688:3167412:,L883075:0:X,L447350:4763840:,L875`
        && `633:1084016:,L453989:111600:,L549318:0:,L876591:3354718:|OK:3321879,2357566,4108588,4351583,0,6544853,1489287,`
        && `153323,0,4608915` TO rt_cases.
    APPEND `23875186|L497768:693102:X,L204121:1774899:X,L863100:4323921:X,L624404:4401105:,L701928:4358517:,L471837:436007`
        && `8:,L804197:4407237:,L014115:122128:,L887777:1321453:,L775964:4425239:|OK:693102,1774899,4323921,3213627,318253`
        && `0,3183670,3218105,89176,964907,3231249` TO rt_cases.
    APPEND `17794124|L739349:1096110:,L853750:3468575:,L377990:838214:,L662656:2602007:,L972001:3564202:,L686538:1917131:,`
        && `L811882:0:,L901049:233959:X,L123738:858501:|OK:1341807,4246068,1026103,3185256,4363131,2346863,0,233959,105093`
        && `7` TO rt_cases.
    APPEND `8946673|L515629:4018953:,L075954:3056152:X,L629913:1650412:|OK:4175728,3056152,1714793` TO rt_cases.
    APPEND `14439667|L342074:3428678:,L565866:1810258:X,L630709:3549803:,L639108:1739775:,L271905:0:,L661629:386508:,L1968`
        && `15:424282:,L921515:2269089:,L568943:3107242:,L695725:3135103:,L779538:4979017:X|OK:1453993,1810258,1505358,737`
        && `783,0,163906,179925,962248,1317682,1329497,4979017` TO rt_cases.
    APPEND `8058234|L634778:458908:,L429006:226869:,L805418:2500485:,L161314:2415604:,L776366:992816:|OK:560753,277218,305`
        && `5415,2951697,1213151` TO rt_cases.
    APPEND `10612004|L206792:3296840:,L308521:4652678:X|OK:5959326,4652678` TO rt_cases.
    APPEND `2634736|L875077:1824170:|OK:2634736` TO rt_cases.
    APPEND `1474907|L036852:2200376:|OK:1474907` TO rt_cases.
    APPEND `16032189|L764689:3468279:,L446330:2560596:,L358921:2501241:,L612224:2507210:X,L088131:3131466:|OK:4022473,2969`
        && `752,2900913,2507210,3631841` TO rt_cases.
    APPEND `1047001|L298037:812429:|OK:1047001` TO rt_cases.
    APPEND `11625265|L059749:811509:,L370837:1509575:X,L281578:2714888:,L176488:2407327:,L230882:4401079:,L682416:3092982:`
        && `X,L372829:0:,L092777:2175813:|OK:455532,1509575,1523975,1351329,2470501,3092982,0,1221371` TO rt_cases.
    APPEND `6235985|L252650:0:,L826069:2703509:X,L207174:1495886:,L768177:4949474:,L623571:2098114:|OK:0,2703509,618505,20`
        && `46462,867509` TO rt_cases.
    APPEND `6793907|L849469:324777:X,L123702:2509130:X,L399662:3311070:,L270712:113977:,L644450:1864024:,L018916:3450842:,`
        && `L553235:3726554:,L001948:4213531:,L412891:4229328:X,L526560:2057742:,L894745:1541334:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `6595231|L790161:506946:X,L142156:1657610:X,L954409:2931119:|OK:506946,1657610,4430675` TO rt_cases.
    APPEND `14874969|L803159:4342888:,L840591:3646901:,L914460:106482:X,L932530:4273017:X,L923396:2698279:,L092170:1755891`
        && `:|OK:3662874,3075865,106482,4273017,2275779,1480952` TO rt_cases.
    APPEND `19462529|L387364:3859013:,L226922:3418060:,L998155:1455764:,L252431:553142:,L648274:3933300:,L479876:4217483:,`
        && `L617281:1700648:X,L247771:825765:,L981797:0:X,L779542:4312457:,L890862:4281800:|OK:2552179,2260553,962778,3658`
        && `24,2601309,2789255,1700648,546124,0,2852067,2831792` TO rt_cases.
    APPEND `38135527|L586597:2446634:X,L792316:188630:X,L671997:17424:,L879264:1885798:X,L739273:0:,L309156:4746319:,L5057`
        && `91:4052777:,L547081:4196321:,L344804:2319919:,L284197:4573876:X,L016330:4380646:X,L976195:1790961:X|OK:2446634`
        && `,188630,25988,1885798,0,7079188,6044762,6258859,3460185,4573876,4380646,1790961` TO rt_cases.
    APPEND `4035521|L848374:2439074:X,L996712:3153528:|OK:2439074,1596447` TO rt_cases.
    APPEND `9636850|L017946:0:,L598009:2998551:X,L384138:4809013:|OK:0,2998551,6638299` TO rt_cases.
    APPEND `12740174|L792241:4354500:X,L955883:2300783:,L820637:40544:,L537915:532902:,L231848:0:X,L541028:669512:,L027799`
        && `:183134:,L273516:3141386:,L397276:4870322:,L283638:2454885:|OK:4354500,1359331,23954,314845,0,395556,108198,18`
        && `55969,2877445,1450376` TO rt_cases.
    APPEND `7511477|L613575:2379834:X,L655101:0:,L149273:3100020:|OK:2379834,0,5131643` TO rt_cases.
    APPEND `18273974|L982359:0:,L132939:464879:,L693924:4376135:,L063204:2745252:X,L438376:538030:X,L714597:4670226:X,L090`
        && `817:201559:|OK:0,951452,8956490,2745252,538030,4670226,412524` TO rt_cases.
    APPEND `20913724|L531751:3719927:,L115046:396738:,L860862:2780973:,L106475:4646845:X,L092853:3529706:,L330784:0:,L0335`
        && `43:797606:X,L111247:3430649:,L583688:1750117:,L190420:3353150:,L076338:558589:X|OK:2925262,311985,2186891,4646`
        && `845,2775677,0,797606,2697781,1376250,2636838,558589` TO rt_cases.
    APPEND `19322424|L417793:2668455:,L591571:3464973:,L415065:959930:,L625378:539004:X,L223849:0:,L340585:3552605:X,L7171`
        && `84:2333825:X,L769547:2163775:,L436490:2075110:,L435675:1237386:X,L200107:4435902:,L072274:4581438:|OK:1528932,`
        && `1985309,550006,539004,0,3552605,2333825,1239768,1188966,1237386,2541618,2625005` TO rt_cases.
    APPEND `5168536|L158435:1307600:,L564765:2568269:X,L257648:0:|OK:2600267,2568269,0` TO rt_cases.
    APPEND `18948555|L157432:301742:X,L864336:1942317:,L211169:1007233:,L340180:4543201:,L704855:2320497:,L614535:4307800:`
        && `,L768140:3998596:X,L525862:93327:,L866454:3530119:|OK:301742,1603398,831479,3750448,1915588,3556122,3998596,77`
        && `042,2914140` TO rt_cases.
    APPEND `3564912|L873707:4888855:|OK:3564912` TO rt_cases.
    APPEND `17064263|L067036:1315326:,L745278:2185401:,L698765:3629918:,L407636:1595219:,L196430:3260289:,L201698:2621683:`
        && `X,L441442:3853549:,L374070:4885693:X|OK:793602,1318562,2190112,962476,1967096,2621683,2325039,4885693` TO rt_cases.
    APPEND `4871897|L054343:960904:,L551160:2695253:,L289575:2160333:,L893934:4179632:X|OK:114364,320783,257118,4179632` TO rt_cases.
    APPEND `3977933|L903117:976865:,L097163:4957958:|OK:654763,3323170` TO rt_cases.
    APPEND `19634424|L743837:1906349:X,L219263:4037000:,L797327:3926669:X,L572027:3273415:,L307594:1475205:,L174619:272638`
        && `:,L177270:4064349:,L530594:2030989:X|OK:1906349,3621016,3926669,2936113,1323196,244545,3645547,2030989` TO rt_cases.
    APPEND `37244690|L246219:3382992:,L974936:4154868:,L413720:2973674:,L380937:829153:,L249224:2163946:X,L624482:3950717:`
        && `X,L703252:467801:,L269644:1962005:,L196654:1787631:,L614221:1678601:,L883902:4178005:|OK:4917766,6039822,43227`
        && `51,1205318,2163946,3950717,680030,2852115,2598632,2440138,6073455` TO rt_cases.
    APPEND `19382783|L595074:4000792:,L113120:2332028:,L636732:1418614:,L143271:1638443:X,L700711:3507114:,L343338:4500506`
        && `:,L244186:2521300:X|OK:3864713,2252708,1370363,1638443,3387826,4347430,2521300` TO rt_cases.
    APPEND `5880560|L910209:2660719:,L416886:1228815:,L758615:0:X,L624249:578542:X,L535694:0:X,L982525:988055:,L958758:148`
        && `1747:,L267342:0:,L167393:4280337:X,L170532:4141426:X,L726101:0:,L820050:3818113:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `3168092|L816926:3861349:X,L988207:1554899:X|ERR:ALL_LOCKED` TO rt_cases.
  ENDMETHOD.

  METHOD set_total_cases_06.
    APPEND `1438036|L845421:2652372:|OK:1438036` TO rt_cases.
    APPEND `2759044|L530429:3725997:|OK:2759044` TO rt_cases.
    APPEND `6903893|L055613:1130384:,L119845:0:,L373832:3489478:X,L109146:2657844:X,L717681:558180:,L134980:4269132:|OK:14`
        && `3548,0,3489478,2657844,70884,542139` TO rt_cases.
    APPEND `21463358|L633549:916874:,L823429:1192197:,L774660:557088:X,L253405:484051:,L050355:907199:X,L146254:4607312:,L`
        && `663845:3163120:X,L892209:3322869:|OK:1466882,1907364,557088,774421,907199,7371115,3163120,5316169` TO rt_cases.
    APPEND `16823307|L047887:287145:,L586607:547567:,L193291:3065296:,L421915:242351:,L825399:2466101:X,L101843:2829329:,L`
        && `107559:395915:,L759531:4136393:X|OK:398346,759620,4252376,336205,2466101,3925027,549239,4136393` TO rt_cases.
    APPEND `2921731|L225371:1219901:,L014537:0:,L582984:931285:|OK:1656864,0,1264867` TO rt_cases.
    APPEND `25575730|L849286:1091514:,L082688:4326342:,L626725:1708273:,L743477:4230482:,L117997:959890:,L543166:1061315:,`
        && `L702475:3904468:X,L124978:407508:,L340990:1910781:|OK:1507029,5973284,2358574,5840932,1325299,1465334,3904468,`
        && `562637,2638173` TO rt_cases.
    APPEND `13993759|L398458:4210180:,L584984:2169794:,L208485:1968567:X,L114198:2804920:,L076948:4313823:X,L659629:117301`
        && `5:X,L844656:1155532:X,L326418:4773041:,L947955:1276661:|OK:1487578,766651,1968567,991059,4313823,1173015,11555`
        && `32,1686453,451081` TO rt_cases.
    APPEND `21321037|L217469:4076886:X,L586513:1661308:,L337854:2828868:X,L741394:3777269:,L092082:572328:,L555541:474302:`
        && `,L215814:2912824:|OK:4076886,2548217,2828868,5793810,877872,727514,4467870` TO rt_cases.
    APPEND `9976272|L918200:2376659:,L368802:2271804:X,L041450:0:,L746807:92290:,L359800:3100219:X|OK:4432141,2271804,0,17`
        && `2108,3100219` TO rt_cases.
    APPEND `16865899|L950999:1618560:,L666147:143662:,L689973:3305686:,L731324:1140864:X,L420565:3418541:,L847253:1411412:`
        && `,L624348:1686662:,L831669:3091443:,L487897:1567691:|OK:1566883,139075,3200143,1140864,3309395,1366349,1632811,`
        && `2992741,1517638` TO rt_cases.
    APPEND `7740575|L233095:4915348:,L348749:3868053:|OK:4331764,3408811` TO rt_cases.
    APPEND `8177044|L949688:1585311:,L483103:3762392:X,L877760:381245:X,L330234:2886913:,L271565:2786264:,L903019:0:,L0964`
        && `27:680444:,L001964:174424:|OK:788109,3762392,381245,1435176,1385140,0,338270,86712` TO rt_cases.
    APPEND `7187321|L159254:3060304:,L632303:4724932:,L044948:4166075:,L623551:1128487:|OK:1681631,2596340,2289249,620101` TO rt_cases.
    APPEND `12949075|L925935:2252464:,L391911:3290495:,L174221:985251:,L515301:1397866:X,L777761:2135913:,L481886:3894264:`
        && `X,L270320:2211801:X,L843740:1571958:X,L679028:4211139:,L328269:597520:|OK:647544,945959,283242,1397866,614037,`
        && `3894264,2211801,1571958,1210628,171776` TO rt_cases.
    APPEND `10361192|L769408:885894:,L983265:3279752:,L892045:0:,L904687:4105711:,L224033:3383488:|OK:787563,2915709,0,364`
        && `9989,3007931` TO rt_cases.
    APPEND `8218784|L614379:2520804:,L715300:3002661:,L431215:456819:|OK:3464375,4126597,627812` TO rt_cases.
    APPEND `16108931|L188194:782379:,L483094:4417015:,L728335:1184196:,L408179:323204:X,L144952:3598914:,L397896:1839591:,`
        && `L552368:4010506:|OK:780063,4403938,1180690,323204,3588259,1834145,3998632` TO rt_cases.
    APPEND `162921|L548007:1671623:,L358073:1092893:|OK:98514,64407` TO rt_cases.
    APPEND `6461284|L571432:1439683:X,L211012:0:X,L292902:3665025:|OK:1439683,0,5021601` TO rt_cases.
    APPEND `23040162|L674370:0:,L987721:528579:,L772020:1848924:,L173489:1758491:,L757762:328992:,L294604:4507634:,L031208`
        && `:3107280:,L092681:1462369:,L434421:928394:,L666245:256519:,L981983:2473778:,L054323:1691959:|OK:0,644609,22547`
        && `87,2144503,401210,5497119,3789368,1783378,1132189,312828,3016805,2063366` TO rt_cases.
    APPEND `878504|L885191:703857:|OK:878504` TO rt_cases.
    APPEND `11569862|L574991:3263057:,L804163:1566839:X,L104915:4313179:X,L277230:4052904:,L178213:4013249:,L808164:147943`
        && `9:,L595214:0:|OK:1449512,1566839,4313179,1800376,1782761,657195,0` TO rt_cases.
    APPEND `24360502|L490234:2384067:X,L767985:4439:X,L770577:4972505:,L997102:593831:X,L744378:3230854:,L893246:1041927:,`
        && `L639114:4659682:,L028323:1452170:,L857655:4979616:X|OK:2384067,4439,5309705,593831,3449947,1112583,4975668,155`
        && `0646,4979616` TO rt_cases.
    APPEND `19811046|L081897:3116863:,L771161:4032801:X,L645863:4145855:,L703383:734057:,L357166:667432:,L037114:2721602:,`
        && `L657485:1795480:,L943204:4473230:|OK:2785611,4032801,3705245,656044,596499,2432358,1604661,3997827` TO rt_cases.
    APPEND `13959586|L765473:493754:,L367085:1484883:,L137428:4637072:,L532548:0:,L017135:3292129:,L116352:1059363:,L59682`
        && `5:1882037:,L128825:3194462:|OK:429614,1291993,4034706,0,2864474,921749,1637556,2779494` TO rt_cases.
    APPEND `312075|L803529:79093:,L849449:0:,L477362:324299:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `3168865|L853333:3766929:|OK:3168865` TO rt_cases.
    APPEND `5186508|L529455:0:,L514488:0:,L038850:4185390:,L651097:3973200:,L642685:3405566:,L087546:808800:,L188452:24122`
        && `13:,L443728:922480:X,L095613:879257:,L118983:1968471:|OK:0,0,1012121,960808,823542,195586,583327,922480,212624`
        && `,476020` TO rt_cases.
    APPEND `7606012|L204057:766036:X,L989140:961571:,L048492:275549:,L809497:3681268:|OK:766036,1337252,383204,5119520` TO rt_cases.
    APPEND `24858606|L020860:842886:,L605189:4474564:,L114936:4763372:,L781145:0:,L121841:4212527:,L934270:3069969:X|OK:12`
        && `84887,6820980,7261236,0,6421534,3069969` TO rt_cases.
    APPEND `29086392|L263840:0:,L509446:2311415:,L796024:1905145:,L890734:2722563:,L070296:2483694:X,L473557:4457227:,L147`
        && `665:4672911:,L032877:1236409:,L395991:3955507:|OK:0,2892120,2383781,3406562,2483694,5577032,5846903,1547037,49`
        && `49263` TO rt_cases.
    APPEND `7378637|L310113:3696096:,L381773:3093509:,L598598:4044857:X|OK:1814829,1518951,4044857` TO rt_cases.
    APPEND `21402547|L541297:2741562:,L208618:3932926:,L700230:2885785:,L767014:2107597:,L538854:4100816:|OK:3721072,53380`
        && `88,3916823,2860602,5565962` TO rt_cases.
    APPEND `9082719|L393108:0:,L851979:2171777:X,L618924:620568:,L063625:4555966:,L832569:0:|OK:0,2171777,828491,6082451,0` TO rt_cases.
    APPEND `628389|L708313:572544:|OK:628389` TO rt_cases.
    APPEND `30504451|L941310:4555925:X,L249779:2262729:X,L989924:2032915:,L937899:4029430:,L142319:0:,L756339:1934279:,L67`
        && `4385:462273:,L615799:3126653:,L154200:3746737:,L589124:2132253:X,L555318:3282544:X|OK:4555925,2262729,2422560,`
        && `4801744,0,2305019,550876,3725933,4464868,2132253,3282544` TO rt_cases.
    APPEND `16517535|L521316:3965642:,L674990:3539184:,L884030:2367521:X,L221841:3543957:,L767287:4857226:|OK:3527842,3148`
        && `464,2367521,3152711,4320997` TO rt_cases.
    APPEND `31084539|L119591:4394426:,L728640:4724024:,L144659:4799913:X,L520560:2483147:,L786798:167041:X,L068563:4786282`
        && `:,L108417:1562786:X,L350601:4853967:|OK:5079796,5460800,4799913,2870427,167041,5532767,1562786,5611009` TO rt_cases.
    APPEND `11194757|L189485:1151491:,L338758:1437528:,L211410:1834235:X,L064532:2300985:,L457041:4568166:|OK:1139603,1422`
        && `687,1834235,2277229,4521003` TO rt_cases.
    APPEND `24877880|L314552:2441397:,L953458:455044:,L056943:3074304:X,L945891:3007643:,L427563:346906:,L469012:3230131:X`
        && `,L867644:3010697:,L393630:1177864:|OK:4343592,809588,3074304,5351024,617195,3230131,5356458,2095588` TO rt_cases.
    APPEND `3948210|L795117:3259502:X,L425039:0:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `25230200|L453023:3070429:,L298340:3222133:,L081474:4560001:,L349946:3176187:,L884035:1295115:,L358605:2601586:`
        && `,L148193:2689174:|OK:3757892,3943562,5580977,3887329,1585089,3184076,3291275` TO rt_cases.
    APPEND `31309625|L517414:2282900:X,L989167:1345256:,L641390:3551709:,L725243:1250641:,L442520:3924612:,L775949:1152829`
        && `:,L480957:1356730:X,L096850:2116644:,L894283:1980137:,L545205:3939047:,L794990:4487476:X,L122483:3165102:|OK:2`
        && `282900,1390638,3671526,1292832,4057009,1191720,1356730,2188049,2046937,4071931,4487476,3271877` TO rt_cases.
    APPEND `7201861|L155865:22890:X,L991040:889182:X,L478886:109883:,L996257:4876537:X|OK:22890,889182,1413252,4876537` TO rt_cases.
    APPEND `2039167|L191946:0:,L377906:0:,L980954:2265523:X,L396898:1452481:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `5683005|L037454:0:X,L008392:3691914:,L216874:2544390:X,L926403:422902:,L053592:4847739:X,L910006:3312963:,L638`
        && `274:3751646:X,L731383:0:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `24701893|L340350:1811341:,L012120:154125:,L595416:3853525:,L599707:2490463:,L144654:2454321:,L441431:1529038:,`
        && `L300849:2765414:,L057489:2335469:,L850814:2312142:,L446795:4711165:,L201507:91401:|OK:1825641,155342,3883948,2`
        && `510125,2473697,1541109,2787246,2353907,2330396,4748359,92123` TO rt_cases.
    APPEND `9744636|L470024:687931:,L902408:1833670:,L678717:3064099:X,L954001:2808030:X,L006514:548872:,L713383:2115388:,`
        && `L633218:1904605:,L694338:0:,L346128:2770010:,L326908:0:X|OK:270171,720138,3064099,2808030,215558,830777,747996`
        && `,0,1087867,0` TO rt_cases.
    APPEND `30736770|L975006:2111686:,L108259:3918950:,L504068:4631815:,L541208:174901:,L690402:4595040:X,L740559:3638883:`
        && `X,L389788:740285:X,L175588:678132:,L885375:3483685:,L598537:286912:,L395776:2157099:,L773021:0:|OK:2634594,488`
        && `9383,5778772,218211,4595040,3638883,740285,846055,4346335,357959,2691253,0` TO rt_cases.
    APPEND `34934173|L253831:4844693:,L306252:0:,L853344:2687745:,L622431:1369889:,L793819:4088281:,L973035:4492430:,L9732`
        && `30:4622913:,L038288:4969029:,L098278:3070666:,L371750:2805850:X,L330590:1050720:|OK:4989423,0,2768038,1410813,`
        && `4210414,4626636,4761018,5117473,3162399,2805850,1082109` TO rt_cases.
    APPEND `44102910|L488163:0:,L092548:3921091:X,L435266:155294:,L939556:0:,L550965:0:,L856838:4835445:X,L152047:3483907:`
        && `X,L520689:1640783:X,L375210:2802414:,L322643:4141920:,L385944:4376236:X,L007981:4459963:X|OK:0,3921091,467776,`
        && `0,0,4835445,3483907,1640783,8441426,12476283,4376236,4459963` TO rt_cases.
    APPEND `9289564|L200595:2873048:,L286062:0:,L436673:3313067:X,L812965:0:,L501002:3324675:X|OK:2651822,0,3313067,0,3324`
        && `675` TO rt_cases.
    APPEND `12301819|L980114:871465:,L115376:3865516:,L584012:4263259:,L750592:4678880:,L007363:2154792:,L405829:2076768:,`
        && `L350244:2997068:,L374205:390125:,L138660:1728526:X,L772660:0:,L469757:625305:X|OK:407051,1805537,1991319,21854`
        && `50,1006478,970034,1399896,182223,1728526,0,625305` TO rt_cases.
    APPEND `21852224|L093892:3526730:,L280117:3778595:,L884911:4180376:,L185990:0:,L234103:2378054:,L769200:4547328:,L2436`
        && `27:4940263:,L454541:3114237:X,L718414:2622969:X,L359704:0:,L306516:3291862:X|OK:1936668,2074977,2295611,0,1305`
        && `885,2497119,2712896,3114237,2622969,0,3291862` TO rt_cases.
    APPEND `17469496|L441470:4181161:,L272347:3482026:,L337427:525928:,L277460:832645:,L957962:2118656:,L899474:2098794:,L`
        && `569752:4229880:,L249364:0:X,L159148:1954645:,L113202:2109206:X,L049145:1007871:|OK:3143358,2617754,395388,6259`
        && `75,1592786,1577853,3179984,0,1469484,2109206,757708` TO rt_cases.
    APPEND `35926762|L376193:2327491:,L426217:793288:,L182569:0:,L383950:2275833:X,L840346:263235:,L112466:318830:,L138988`
        && `:3890984:,L885058:3734332:,L309087:4649329:,L963453:4543044:X,L238171:1664765:X,L747831:2914816:|OK:3380933,11`
        && `52337,0,2275833,382377,463135,5652076,5424522,6753654,4543044,1664765,4234086` TO rt_cases.
    APPEND `42476190|L178347:547892:,L843510:4079271:,L490732:1826743:X,L280433:4175181:X,L616171:3602632:X,L247060:373670`
        && `3:,L195536:2232372:X,L937949:4782020:,L536832:0:X,L961960:2748708:,L855018:4684544:|OK:815729,6073425,1826743,`
        && `4175181,3602632,5563393,2232372,7119713,0,4092416,6974586` TO rt_cases.
    APPEND `0|L248209:0:,L379628:0:|OK:0,0` TO rt_cases.
    APPEND `10029001|L659183:3010364:,L996669:3905361:,L146316:1887655:,L355065:1633867:|OK:2892616,3752605,1813821,156995`
        && `9` TO rt_cases.
    APPEND `16713434|L497066:806330:,L994002:0:X,L842101:3609890:,L043384:1607938:,L705091:2933668:X,L251708:1717176:,L224`
        && `386:1069615:,L376773:1933693:,L063698:2973312:X|OK:810969,0,3630657,1617188,2933668,1727055,1075768,1944817,29`
        && `73312` TO rt_cases.
    APPEND `6843122|L306938:2984395:,L436194:0:,L767744:3779545:X|OK:3063577,0,3779545` TO rt_cases.
    APPEND `8559709|L453259:3542685:X,L950937:740762:,L640796:1068090:,L577692:2875259:,L920024:488277:,L124259:3584497:,L`
        && `355403:2132433:,L013129:0:,L050107:0:X,L762741:1015432:|OK:3542685,312180,450125,1211722,205775,1510616,898672`
        && `,0,0,427934` TO rt_cases.
    APPEND `8066657|L365289:131745:,L765294:462117:X,L523719:5913:,L883169:4658756:,L917020:2523017:X,L418646:916816:,L209`
        && `141:1826259:,L533790:2691735:X|OK:41759,462117,1874,1476684,2523017,290603,578868,2691735` TO rt_cases.
    APPEND `17738292|L638182:310309:X,L869130:3720118:,L704955:373156:X,L839943:4779064:,L280434:2194002:,L067013:1914120:`
        && `,L997183:698330:|OK:310309,4768354,373156,6125684,2812216,2453471,895102` TO rt_cases.
    APPEND `27030244|L298297:2595802:X,L421062:2403219:,L365473:4071138:,L776495:3302771:,L993440:3077995:X,L952279:178507`
        && `:X,L153005:91973:,L230388:0:,L605337:480569:,L631357:4968738:X,L889678:1949165:X|OK:2595802,3311216,5609317,45`
        && `50641,3077995,178507,126723,0,662140,4968738,1949165` TO rt_cases.
    APPEND `0|L159292:0:|OK:0` TO rt_cases.
    APPEND `3035535|L848971:178988:,L407910:3533508:X,L336721:0:X,L972961:3209984:X,L118274:2504594:,L276442:4113413:,L343`
        && `798:0:,L739055:30529:,L062367:0:,L402302:1577757:,L757630:54521:|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `9937688|L425719:417962:,L085129:0:X,L826092:3507687:,L079643:762534:,L323763:190666:,L764176:2977173:,L257150:`
        && `922877:|OK:473132,0,3970692,863186,215833,3370151,1044694` TO rt_cases.
    APPEND `11139331|L236393:1607357:X,L765200:3758697:,L991273:2968851:,L171930:1136901:X,L660453:2425003:X,L211779:30383`
        && `0:,L435330:394845:,L909267:3681011:|OK:1607357,2020276,1595739,1136901,2425003,163307,212227,1978521` TO rt_cases.
    APPEND `18297092|L844681:3151119:,L601334:4864100:,L205318:402699:,L594326:0:,L475358:1546010:,L854533:786935:,L386229`
        && `:2989521:,L266317:2022280:X|OK:3732346,5761289,476977,0,1831173,932086,3540941,2022280` TO rt_cases.
    APPEND `8360042|L852073:929017:X,L857502:2687735:,L446977:1750335:X,L939072:488064:|OK:929017,4807669,1750335,873021` TO rt_cases.
    APPEND `7678142|L162424:690972:,L965586:351177:,L925113:3693289:,L807351:3964015:,L694354:0:,L906063:0:|OK:609852,3099`
        && `49,3259699,3498642,0,0` TO rt_cases.
    APPEND `107605|L912188:0:X,L812907:4501816:,L428511:2241193:X,L978218:170307:X|ERR:BELOW_LOCKED_TOTAL` TO rt_cases.
    APPEND `21093036|L073779:3575758:,L402364:3948109:,L011858:3757875:,L504394:3252968:,L727010:4604523:,L502294:4098957:`
        && `,L053473:4171407:|OK:2751722,3038265,2891870,2503319,3543407,3154350,3210103` TO rt_cases.
    APPEND `2078722|L162850:2450532:,L223948:1298111:|OK:1358885,719837` TO rt_cases.
    APPEND `26335358|L524497:945315:,L735193:3772167:,L680989:2425070:,L636829:2275799:,L816396:3449931:,L671802:3606052:,`
        && `L914683:2155007:,L090574:1763814:,L387908:3078013:|OK:1060672,4232485,2721002,2553515,3870927,4046099,2417983,`
        && `1979052,3453623` TO rt_cases.
    APPEND `1721267|L595560:1806352:,L809764:2832563:|OK:670246,1051021` TO rt_cases.
    APPEND `29210148|L527604:52720:,L759890:1355078:X,L704231:3617672:,L495082:509179:,L451717:4418568:,L094449:1673688:,L`
        && `915496:2390760:X,L088899:1439583:,L982300:4386467:,L782546:2578875:|OK:71880,1355078,4932417,694226,6024377,22`
        && `81944,2390760,1962760,5980609,3516097` TO rt_cases.
    APPEND `17243185|L328691:4592511:X,L637300:1807936:,L160723:918004:,L321082:3580932:,L037912:902348:,L985486:0:,L39683`
        && `0:1918528:,L178566:2176527:X,L543575:4015951:,L072258:2612557:X,L830911:521757:,L526210:254572:|OK:4592511,102`
        && `1065,518459,2022397,509617,0,1083524,2176527,2268082,2612557,294672,143774` TO rt_cases.
    APPEND `4914571|L432587:336081:,L614527:0:X,L102355:455458:X,L890824:3316847:|OK:410253,0,455458,4048860` TO rt_cases.
    APPEND `40227339|L507216:2129555:,L358107:3857938:,L933048:946627:,L136250:3207038:,L179831:1384067:,L727280:371535:,L`
        && `949316:3074812:,L907896:2931168:,L882469:4574534:,L045091:1046835:,L895958:1979716:X,L655774:2099308:|OK:31787`
        && `49,5758676,1413014,4787089,2065972,554584,4589718,4375303,6828326,1562592,1979716,3133600` TO rt_cases.
    APPEND `7155915|L899588:4272675:,L005807:3711625:,L296627:0:,L183619:1229045:,L625787:2111934:,L350467:439568:,L403599`
        && `:1535157:X,L883579:614436:X,L971022:0:|OK:1818161,1579416,0,522998,898696,187051,1535157,614436,0` TO rt_cases.
    APPEND `13410261|L047168:0:X,L097382:2952389:,L133220:0:X,L182700:4815626:,L106670:4522933:,L826757:157679:,L731336:11`
        && `21833:,L857432:2520696:,L422594:0:X|OK:0,2460501,0,4013310,3769382,131409,934928,2100731,0` TO rt_cases.
    APPEND `6778550|L603886:2045409:,L871901:797444:X,L603787:2105009:|OK:2947609,797444,3033497` TO rt_cases.
    APPEND `13812645|L056489:4574060:,L506668:3094731:,L644536:3651920:X,L688168:3664613:X,L751844:4983372:,L416941:868947`
        && `:,L740231:2005059:|OK:1913776,1294828,3651920,3664613,2085031,363565,838912` TO rt_cases.
    APPEND `26892267|L472914:752691:,L344435:3060903:,L311731:3105273:,L131478:2435174:X,L922599:0:X,L582501:0:X,L228486:3`
        && `331424:,L897118:237462:X,L530536:4496089:X,L369586:4505429:X,L168629:1007783:,L414524:3484018:|OK:776995,31597`
        && `39,3205542,2435174,0,0,3438996,237462,4496089,4505429,1040324,3596517` TO rt_cases.
    APPEND `7767399|L843425:1415150:,L486766:508069:,L533919:335756:,L748378:0:,L090564:0:,L783671:3244470:|OK:1997301,717`
        && `073,473876,0,0,4579149` TO rt_cases.
    APPEND `10598336|L876651:2729626:X,L078592:2988062:,L461753:4796706:X,L327486:0:,L771872:2568985:X,L348715:762283:,L41`
        && `4277:2969464:,L566726:934408:,L760415:4369266:X,L012254:315419:,L084735:0:,L701490:2514231:|ERR:BELOW_LOCKED_T`
        && `OTAL` TO rt_cases.
    APPEND `12039512|L487898:0:,L856162:2604914:,L589044:120913:,L216004:0:,L603760:2411852:,L445780:4147448:X,L169127:188`
        && `2363:|OK:0,2928493,135933,0,2711450,4147448,2116188` TO rt_cases.
    APPEND `5922202|L026547:3792629:,L998666:2134925:|OK:3789205,2132997` TO rt_cases.
    APPEND `5689836|L728909:954115:,L959092:0:X,L869220:1841094:,L112439:0:,L275211:3412826:X|OK:777233,0,1499777,0,341282`
        && `6` TO rt_cases.
    APPEND `17670485|L767879:1483203:X,L795563:4670760:X,L487593:3041689:,L384296:2686716:X,L470557:475633:,L673918:868017`
        && `:|OK:1483203,4670760,6124389,2686716,957679,1747738` TO rt_cases.
    APPEND `7379980|L192807:76285:,L143628:393795:,L477896:2990475:,L143330:1212730:,L053751:616015:X,L456482:516736:,L188`
        && `197:405932:,L392423:2399470:,L606983:418364:,L547217:2379154:,L281738:1438457:X|OK:37641,194308,1475576,598391`
        && `,616015,254971,200297,1183959,206431,1173934,1438457` TO rt_cases.
    APPEND `9349915|L411925:1923733:,L250955:4344576:,L578912:0:,L746155:3861132:,L619277:2997158:|OK:1370251,3094588,0,27`
        && `50237,2134839` TO rt_cases.
    APPEND `21575336|L033740:0:,L313226:868517:,L427335:2171640:X,L774682:2335763:,L670727:3383680:,L293692:4237260:,L9824`
        && `74:4265799:,L900139:787784:,L043854:3595591:X|OK:0,864650,2171640,2325363,3368615,4218394,4246806,784277,35955`
        && `91` TO rt_cases.
    APPEND `10854908|L864666:0:,L513273:4944304:,L668189:1572747:,L762492:2029353:|OK:0,6279830,1997568,2577510` TO rt_cases.
    APPEND `2269519|L127698:1745062:X|ERR:ALL_LOCKED` TO rt_cases.
    APPEND `14923630|L439077:2777106:X,L569155:2557565:,L164648:4805073:|OK:2777106,4219347,7927177` TO rt_cases.
    APPEND `20719827|L463914:2029846:,L017232:4310847:,L511595:2636619:,L520440:4025644:,L195666:0:,L969954:3137375:X|OK:2`
        && `744735,5829079,3565207,5443431,0,3137375` TO rt_cases.
  ENDMETHOD.

ENDCLASS.


"! Products |total| x weight at or above 2^53: exact on an ABAP kernel (31-digit packed arithmetic),
"! but computed in float64 by the open-abap emulator, so this class carries data only for kernel runs.
CLASS ltc_allocator_kernel DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    TYPES ty_amount TYPE zcl_pln_allocator=>ty_amount.
    METHODS large_magnitude_split FOR TESTING RAISING cx_static_check.
    METHODS kernel_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS kernel_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS kernel_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS kernel_cases_04 RETURNING VALUE(rt_cases) TYPE string_table.
ENDCLASS.


CLASS ltc_allocator_kernel IMPLEMENTATION.

  METHOD large_magnitude_split.
    DATA lt_cases TYPE string_table.
    DATA lt_parts TYPE string_table.
    DATA lt_exp TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF kernel_cases_01( ) TO lt_cases.
    APPEND LINES OF kernel_cases_02( ) TO lt_cases.
    APPEND LINES OF kernel_cases_03( ) TO lt_cases.
    APPEND LINES OF kernel_cases_04( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_total) DATA(lv_weights) DATA(lv_expected).
      SPLIT lv_weights AT `,` INTO TABLE lt_parts.
      SPLIT lv_expected AT `,` INTO TABLE lt_exp.
      DATA(lt_w) = VALUE zcl_pln_allocator=>tt_share( ).
      LOOP AT lt_parts INTO DATA(lv_part).
        SPLIT lv_part AT `:` INTO DATA(lv_key) DATA(lv_weight).
        APPEND VALUE #( key = lv_key amount = CONV ty_amount( lv_weight ) ) TO lt_w.
      ENDLOOP.
      DATA(lt_s) = zcl_pln_allocator=>split( it_weights = lt_w iv_total = CONV ty_amount( lv_total ) ).
      LOOP AT lt_s INTO DATA(ls_s).
        IF ls_s-amount <> CONV ty_amount( lt_exp[ sy-tabix ] ).
          lv_failed = lv_failed + 1.
          IF lv_first IS INITIAL.
            lv_first = lv_case.
          ENDIF.
          EXIT.
        ENDIF.
      ENDLOOP.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
  ENDMETHOD.

  METHOD kernel_cases_01.
    APPEND `148748756732|K598208:0,K169835:0,K301850:886596|0,0,148748756732` TO rt_cases.
    APPEND `465680757151|K710913:383308|465680757151` TO rt_cases.
    APPEND `933702222463|K946261:500257,K146377:460388,K647181:279710,K002852:981523,K455783:115670,K317594:397128,K522051`
        && `:400067,K827265:407456|131864718132,121355490981,73729863468,258723523579,30489912078,104680537768,10545524038`
        && `4,107402936073` TO rt_cases.
    APPEND `22587682685|K824514:0,K413262:671359,K360795:451345,K769556:0,K483479:960877,K037909:0,K450518:682290,K353501:`
        && `355885,K993385:489365,K910632:996140,K826480:911703,K917190:697285,K841538:769673|0,2170714769,1459340319,0,31`
        && `06817507,0,2206058129,1150688120,1582270935,3220833876,2947822502,2254541680,2488594848` TO rt_cases.
    APPEND `-743621900896|K030012:167260,K357942:0,K975886:0,K963157:66036,K109760:0,K182527:238024,K063567:616533,K406902`
        && `:695806,K828374:924241|-45931607202,0,0,-18134279644,0,-65364252498,-169307375245,-191076694256,-253807692051` TO rt_cases.
    APPEND `717039348033|K813256:305143,K465997:376919|320791273780,396248074253` TO rt_cases.
    APPEND `-498501760970|K326090:838584,K771044:507610,K198793:0,K851849:247513,K953392:391121,K186919:0,K459407:412645,K`
        && `326457:0,K982041:516547,K801966:105166|-138459704278,-83812152973,0,-40867196113,-64578501375,0,-68132357250,0`
        && `,-85287752766,-17364096215` TO rt_cases.
    APPEND `850916854377|K082379:0,K938867:81963|0,850916854377` TO rt_cases.
    APPEND `751284285736|K286582:177920,K560575:186953,K575484:282603,K141588:406181,K019707:474125,K895148:0,K041053:2443`
        && `04,K240586:424072,K664410:403666,K719483:772270,K565009:529866,K322575:540588,K579413:0|30088251183,3161583196`
        && `7,47791310978,68689725460,80179811670,0,41314524039,71715292580,68264410984,130599447737,89606234833,914194443`
        && `05,0` TO rt_cases.
    APPEND `555207093103|K982503:782983,K206421:730601|287210828985,267996264118` TO rt_cases.
    APPEND `-871540914770|K839333:24569,K981232:0,K306970:297898,K395022:398271|-29709670830,0,-360228398431,-481602845509` TO rt_cases.
    APPEND `903474435558|K047191:777366,K757151:884017,K942962:897945,K496032:916576,K969605:250895,K980047:0,K883620:6130`
        && `4,K692724:17687,K993125:0,K346826:0,K599223:0,K540625:213757|174728721439,198700689431,201831288958,2060189827`
        && `97,56393722603,0,13779313141,3975510758,0,0,0,48046206431` TO rt_cases.
    APPEND `759208596333|K479826:153239,K209483:810015,K716787:0,K227733:879409,K582504:444072|50876190767,268929434831,0,`
        && `291968624477,147434346258` TO rt_cases.
    APPEND `-65175002537|K983891:572364,K617046:827262|-26652709475,-38522293062` TO rt_cases.
    APPEND `-564925795983|K775462:44236,K192417:420224,K604013:0,K191949:0,K011322:496540,K788557:918400,K533087:973067,K3`
        && `55991:74832,K859689:989929,K414876:635266|-5489311466,-52146225276,0,0,-61616391968,-113965630933,-12074934080`
        && `5,-9286014911,-122841771629,-78831108995` TO rt_cases.
    APPEND `-789968229237|K488104:34370,K752921:772131,K543123:290921,K956177:145811,K981003:782859,K567508:237412,K587426`
        && `:897156,K780351:429930,K480320:332033,K016864:0,K623498:292215,K741841:840995,K998791:0,K734093:801192|-463566`
        && `5383,-104141429960,-39238068340,-19666307976,-105588372591,-32021023854,-121004219150,-57986954264,-4478306325`
        && `4,0,-39412597028,-113429485267,0,-108061042170` TO rt_cases.
    APPEND `-347641965110|K055086:906131,K954852:490126,K107378:488285,K542081:305047,K099064:606219,K149793:217852|-10452`
        && `7107068,-56538682463,-56326313165,-35188819751,-69930637314,-25130405349` TO rt_cases.
    APPEND `-325202693087|K494878:162327,K344787:767834,K982968:0|-56752731582,-268449961505,0` TO rt_cases.
    APPEND `-459796596702|K087555:0,K417420:194129,K885200:902152,K517491:0,K721869:604831,K271654:704601|0,-37103284357,-`
        && `172425563360,0,-115599506417,-134668242568` TO rt_cases.
    APPEND `567022574849|K226799:742239,K204296:0,K045954:0,K271735:119567,K786644:15240,K975824:542678,K635694:139998|269`
        && `834155659,0,0,43467482158,5540361706,197285591198,50894984128` TO rt_cases.
    APPEND `703577042412|K597221:455412,K385605:897418,K097686:252763|199563294084,393252027287,110761721041` TO rt_cases.
    APPEND `-828686650905|K588211:601727,K021217:615619,K845982:4567,K379014:831867,K420207:780867,K855167:0,K012467:69339`
        && `4,K861527:521624,K451395:48237,K377546:748652,K550760:0,K077913:424361,K760820:360486,K779832:0|-88546905537,-`
        && `90591177461,-672055131,-122413068831,-114908183422,0,-102036127709,-76759379343,-7098297205,-110167597472,0,-6`
        && `2446679941,-53047178853,0` TO rt_cases.
    APPEND `25858760229|K907260:818029,K651867:198913,K514292:0|20800808474,5057951755,0` TO rt_cases.
    APPEND `666401279842|K950077:91810,K802502:527629,K332720:208083,K759611:842623|36632927981,210528212150,83026789598,3`
        && `36213350113` TO rt_cases.
    APPEND `-317221504223|K404172:184104,K823430:274285,K585025:549372,K675261:0,K616580:624084,K989074:527599,K130640:117`
        && `282,K245059:296911,K150472:659066,K530272:439785,K414533:588940,K762103:0|-13704736491,-20417827143,-408953553`
        && `17,0,-46456930691,-39274569090,-8730494205,-22102110851,-49060997370,-32737678364,-43840804701,0` TO rt_cases.
    APPEND `618376667478|K504460:48467,K981303:929284,K566060:367116,K409737:183541,K933165:0,K346288:381066,K658874:0|156`
        && `95873284,300945466165,118889269327,59439129271,0,123406929431,0` TO rt_cases.
    APPEND `-742116924145|K104530:529201,K162234:0,K782184:875175,K551171:785477,K393180:980851|-123861772772,0,-204838477`
        && `224,-183844274088,-229572400061` TO rt_cases.
    APPEND `-350004682860|K945793:517392,K225880:133007|-278428507538,-71576175322` TO rt_cases.
    APPEND `-975429246080|K150847:146986,K509397:0,K995641:664733,K391237:497266,K625581:646499,K574838:628988,K261883:646`
        && `32,K354203:0,K121106:188955,K237485:491981,K566583:0|-43054871162,0,-194712378540,-145658250196,-189371308501,`
        && `-184242018304,-18931887615,0,-55348354132,-144110177630,0` TO rt_cases.
    APPEND `-835305321391|K321546:552131,K748160:0,K037642:22285,K690936:0,K117973:272291,K246981:875174,K413676:0,K659958`
        && `:0,K602940:804232,K593184:880508,K600299:819439|-109131901205,0,-4404759773,0,-53819898740,-172983227721,0,0,-`
        && `158961129097,-174037523823,-161966881032` TO rt_cases.
    APPEND `-378600569515|K988269:0,K257412:0,K104246:183961,K535322:0,K300077:325073,K849853:134560,K427345:613767,K02626`
        && `4:604245,K871541:559015,K236448:317389,K313490:335003,K336282:538605,K565974:508408,K676449:9574|0,0,-16865492`
        && `873,0,-29802601447,-12336423052,-56269986379,-55397012090,-51250338378,-29098134482,-30712981061,-49379155304,`
        && `-46610702815,-877741634` TO rt_cases.
    APPEND `-625553618242|K415521:171639,K824310:22726,K813921:367208,K388877:0,K530690:168197,K011771:0|-147127721723,-19`
        && `480564463,-314768068086,0,-144177263970,0` TO rt_cases.
    APPEND `616485877998|K893331:557415,K274453:162608,K152466:793833,K565834:496676|170919177454,49860203991,243411611448`
        && `,152294885105` TO rt_cases.
    APPEND `552235708339|K261277:955344|552235708339` TO rt_cases.
    APPEND `155189516946|K721350:0,K987188:0,K673848:121788,K106694:243181,K584466:199837,K475638:57363,K542423:903640,K23`
        && `5511:0,K930378:483416|0,0,9406721940,18782934674,15435109307,4430631841,69795794445,0,37338324739` TO rt_cases.
    APPEND `-165120960295|K120056:185170,K328097:770793,K931849:111265,K802008:79608,K671073:122436,K303026:590631,K474854`
        && `:0,K694644:0,K152660:611135|-12373524089,-51506322585,-7435006523,-5319606338,-8181480776,-39467445624,0,0,-40`
        && `837574360` TO rt_cases.
    APPEND `-992694616731|K001694:336119,K186861:905169,K549445:694893,K184977:91074,K841570:0,K446852:952902,K235482:5156`
        && `76,K477582:966577,K425420:363937,K237446:782975,K800698:262225|-56827190838,-153035715039,-117484632296,-15397`
        && `759658,0,-161105869658,-87184653240,-163417883661,-61530342979,-132376538506,-44334030856` TO rt_cases.
    APPEND `-758475932135|K974726:386769,K829467:263549,K589824:963253,K455044:0,K859823:722426,K978028:0,K651563:444869,K`
        && `657815:0,K726102:946832,K944773:751853,K795208:0|-65487585206,-44624020005,-163097644620,0,-122320905320,0,-75`
        && `325055894,0,-160317246924,-127303474166,0` TO rt_cases.
    APPEND `773821093405|K339765:379839,K560326:741317,K595891:548245,K433543:725216|122745069586,239556777347,17716551137`
        && `6,234353735096` TO rt_cases.
    APPEND `265733204091|K586282:0,K526758:221115,K022950:131303,K054658:688626,K483515:677511,K670618:196437,K953477:0,K2`
        && `10173:194703|0,27851228458,16538678291,86738032465,85338008023,24742834112,0,24524422742` TO rt_cases.
    APPEND `463266433736|K010026:64277,K968044:0,K449651:503551|52440838707,0,410825595029` TO rt_cases.
    APPEND `-442004795152|K111901:722499,K986000:591803,K895434:537564,K007215:73295,K193937:155757,K856620:226595,K561442`
        && `:290138,K292257:188395,K053094:705869,K794817:401610,K962839:0,K445761:956952|-65838477843,-53928668002,-48986`
        && `082338,-6679083616,-14193519705,-20648706624,-26439129029,-17167691628,-64323051681,-36597131742,0,-8720325294`
        && `4` TO rt_cases.
    APPEND `-924509923313|K005857:573063,K869372:365750,K393712:778176,K957666:532606,K860209:0,K629839:182019,K655696:610`
        && `824|-174137461530,-111140968017,-236465437943,-161843735917,0,-55310370082,-185611949824` TO rt_cases.
    APPEND `-392107614420|K332184:605434,K577098:252012,K345591:417902,K013849:76105,K483493:163123,K079515:141411,K453330`
        && `:670709,K403419:565301,K704819:971216,K259579:0|-61450218103,-25578663181,-42416132965,-7724489951,-1655662537`
        && `6,-14352905176,-68075486897,-57376806958,-98576285813,0` TO rt_cases.
    APPEND `-319608754261|K012164:277735,K409340:188463,K203041:300897,K302443:0,K430518:923937,K680591:0,K967153:165886,K`
        && `490685:430797,K384196:314091,K993533:861130,K000818:451664,K541432:997425,K990845:0|-18071271495,-12262646191,`
        && `-19578344029,0,-60117437021,0,-10793637616,-28030495062,-20436832719,-56030799224,-29388239755,-64899051149,0` TO rt_cases.
    APPEND `-239832751387|K827063:574585,K604389:220956,K168991:0,K812039:343899,K110829:885308,K359619:317028,K195629:311`
        && `109,K387674:0|-51945071669,-19975417485,0,-31090018365,-80035830225,-28660758950,-28125654693,0` TO rt_cases.
    APPEND `-701382032210|K448680:0,K111574:178736,K575747:120249,K501119:946117,K740027:0,K251725:622741,K552915:463027,K`
        && `566834:0,K389191:986135,K916915:884660|0,-29836319390,-20073111015,-157934881569,0,-103953872601,-77292887041,`
        && `0,-164615068153,-147675892441` TO rt_cases.
    APPEND `361973137031|K974459:93575|361973137031` TO rt_cases.
    APPEND `876638660032|K060915:697541,K481082:781121,K300443:605963,K219630:658285,K536140:473783,K024206:778218,K588509`
        && `:0,K952751:0,K918393:822848,K378874:0,K625702:0,K287554:106716|124173928705,139052562306,107871517745,11718570`
        && `6155,84341273794,138535779902,0,0,146480664057,0,0,18997227368` TO rt_cases.
    APPEND `860472262409|K976353:57435,K587058:0,K368711:520258,K668637:387308,K530326:195769,K676120:0,K441226:69371,K054`
        && `998:874524,K003520:63907,K864735:549564|18182027828,0,164696534057,122608946355,61974012463,0,21960571993,2768`
        && `45472342,20230849698,173973847673` TO rt_cases.
    APPEND `-996959110195|K771627:260228,K817440:282146,K451085:0,K958176:187606,K519833:927594|-156515893304,-16969862287`
        && `0,0,-112836899485,-557907694536` TO rt_cases.
    APPEND `-908759443421|K695485:504715,K598416:354995,K255264:731654,K477139:0,K658945:537866,K499507:0,K085718:461087,K`
        && `402836:762723,K681134:839075,K040612:508727,K849672:228409|-93049536833,-65447074742,-134888136517,0,-99161273`
        && `547,0,-85006254599,-140616034559,-154692331551,-93789191375,-42109609698` TO rt_cases.
    APPEND `-961326104872|K343182:503712,K453877:896025,K696071:982575,K555170:56580,K643096:745182,K616244:673410,K654360`
        && `:671089,K309828:929273|-88722088336,-157822742364,-173067359815,-9965805377,-131253778410,-118612106733,-11820`
        && `3293825,-163678930012` TO rt_cases.
    APPEND `72359968939|K386832:239243,K709879:600625,K446481:0,K049130:0,K850990:700708,K391557:829981,K699132:990297,K52`
        && `0459:455653,K490693:521746,K284719:740222,K447925:0,K332915:557660,K620320:76038|3030653317,7608524172,0,0,887`
        && `6343401,10513932155,12544763641,5772065539,6609310389,9376894035,0,7064257381,963224909` TO rt_cases.
    APPEND `-741658917979|K578031:723770|-741658917979` TO rt_cases.
    APPEND `282173385693|K286231:886779,K097300:2417,K008161:790588,K979219:0,K828790:224222,K401792:755846,K233939:418795`
        && `,K286637:0,K726054:895745,K415854:0,K724650:0,K322424:285837,K372902:0|58735207143,160088360,52364061333,0,148`
        && `51192480,50062948466,27738603503,0,59329064087,0,0,18932220321,0` TO rt_cases.
    APPEND `270264042929|K457445:622184,K763691:42779,K379535:712764,K570807:605123,K557787:679587,K165453:0,K698145:98126`
        && `5,K382424:258854,K608648:573249,K738336:11399|37474107102,2576576749,42929735375,36446524038,40931486543,0,591`
        && `01535407,15590761768,34526754822,686561125` TO rt_cases.
    APPEND `-381988219284|K298899:847205,K879447:493683,K928408:270478,K452601:113022,K310067:583173,K521428:681724,K79501`
        && `4:617330,K455638:20201,K600524:156626,K111338:102148,K916534:0|-83287822266,-48533450534,-26590404437,-1111107`
        && `2584,-57331117232,-67019561200,-60689055564,-1985938819,-15397735436,-10042061212,0` TO rt_cases.
    APPEND `-430375098548|K158082:827886,K981582:988662,K913316:597643,K381153:0,K194969:797231,K487987:359719,K922967:352`
        && `436,K924955:0,K505466:542417,K779790:526433,K735909:0|-71368398344,-85228187749,-51520165447,0,-68725766083,-3`
        && `1009787439,-30381952151,0,-46759375716,-45381465619,0` TO rt_cases.
    APPEND `865646709434|K862235:0,K622528:284631,K788521:622544,K259318:171512,K777180:0,K727925:356745|0,171648596766,37`
        && `5429254104,103431439754,0,215137418810` TO rt_cases.
    APPEND `-926171271198|K505456:790752,K952376:624764,K586808:0,K615303:475601,K527859:0,K986469:0,K752843:547388,K34039`
        && `5:0,K465815:0,K085357:925867,K719382:942704,K356858:148279,K032672:453915|-149181402743,-117866499109,0,-89725`
        && `760195,0,0,-103268925889,0,0,-174671879190,-177848307802,-27973965563,-85634530707` TO rt_cases.
    APPEND `-415939269423|K136730:841289,K014326:0,K543453:654307,K431691:11878,K039682:681193,K960878:770731,K529898:5086`
        && `66,K305715:0,K071698:0,K728197:247211|-94185526518,0,-73252175292,-1329787605,-76262165992,-86286288111,-56947`
        && `107393,0,0,-27676218512` TO rt_cases.
    APPEND `-239396570162|K791758:0,K257291:0,K652974:986707,K601950:996863,K705356:0,K482236:0|0,0,-119085422523,-1203111`
        && `47639,0,0` TO rt_cases.
    APPEND `-862093681547|K042986:450466,K993727:695640,K492513:425822,K804970:0,K711879:616704,K635721:14434|-17627428881`
        && `0,-272214653865,-166630711773,0,-241325780428,-5648246671` TO rt_cases.
    APPEND `-902192971698|K961316:746931,K550983:186999,K358896:905866,K091218:0,K354799:106716,K010059:829300,K613873:311`
        && `251,K471550:839050,K950799:292307,K370454:834658,K976205:338154,K541966:126914,K369114:60238,K657887:0|-120801`
        && `274803,-30243379358,-146505858776,0,-17259196421,-134122826867,-50338675974,-135699695988,-47274859704,-134989`
        && `377098,-54689702636,-20525822319,-9742301754,0` TO rt_cases.
    APPEND `-441269947443|K287361:79338,K982319:153858,K663086:0,K854419:0,K966654:0,K787169:901078,K710573:120534|-279002`
        && `64495,-54106215113,0,0,0,-316876081203,-42387386632` TO rt_cases.
    APPEND `-758617194336|K253620:0,K345574:2481,K634122:551668,K022878:0,K718365:580852,K623135:891516,K332656:366325,K29`
        && `7171:422631,K482405:246276,K568927:0,K847092:0|0,-614723565,-136688157770,0,-143919150317,-220893145266,-90765`
        && `259894,-104716338099,-61020419425,0,0` TO rt_cases.
    APPEND `-73537466541|K201969:0,K567531:447092,K024711:803118,K244688:0,K509819:0,K028145:0,K186576:794168,K499171:0,K3`
        && `19281:226546,K208695:134926,K672572:95197,K225989:306980|0,-11708581503,-21032298854,0,0,0,-20797913527,0,-593`
        && `2855665,-3533483193,-2493048038,-8039285761` TO rt_cases.
    APPEND `-278249645829|K279735:744456,K552942:211974,K237470:512608,K876678:276498,K244863:199639,K516082:617083|-80844`
        && `559110,-23019418975,-55666913500,-30026433939,-21679893689,-67012426616` TO rt_cases.
    APPEND `846481652603|K397799:611711,K476267:610923,K277341:83846,K650858:158714,K901125:0,K293451:928927,K747120:45466`
        && `7|181762257562,181528113237,24913788125,47159876063,0,276019016546,135098601070` TO rt_cases.
    APPEND `73999966186|K519102:382868|73999966186` TO rt_cases.
    APPEND `320986780509|K733795:708159,K629433:439277,K231208:200238,K305490:936720,K533349:57776|97050887638,60201484086`
        && `,27441966619,128374429285,7918012881` TO rt_cases.
    APPEND `-166579014466|K972882:906244,K598514:98301|-150278217885,-16300796581` TO rt_cases.
    APPEND `-556665105807|K518484:69489,K682990:0,K575058:537591,K936336:0,K584416:688896,K918799:0,K989474:106166,K928832`
        && `:717720,K780445:871410,K184142:451425|-11235987814,0,-86925497915,0,-111390681413,0,-17166456305,-116051363143`
        && `,-140902187980,-72992931237` TO rt_cases.
    APPEND `-582775993188|K141359:63027,K336428:655302,K812019:171235,K110981:616008,K549014:620501,K919754:0,K694470:0,K5`
        && `36201:388388,K615545:405174,K745035:65768,K285478:0|-12303405109,-127920509857,-33426524725,-120249987694,-121`
        && `127059412,0,0,-75816632609,-79093402219,-12838471563,0` TO rt_cases.
    APPEND `660271856084|K397502:641588,K913574:43420,K128770:296532,K894950:45424,K342786:67488|387063571177,26194848190,`
        && `178894765625,27403841183,40714829909` TO rt_cases.
    APPEND `-513632139320|K779931:931280,K947082:0,K054949:0,K945138:469725,K641487:0,K812203:186917,K071966:772631,K66518`
        && `3:428170,K173993:67746|-167456863248,0,0,-84462970416,0,-33610229478,-138929606250,-76990813866,-12181656062` TO rt_cases.
    APPEND `713886207446|K903788:203682,K079818:620991,K804425:0,K563762:29540,K770702:816711|87021175412,265312431833,0,1`
        && `2620680874,348931919327` TO rt_cases.
    APPEND `-428882585926|K886518:792950,K043193:975640|-192290155723,-236592430203` TO rt_cases.
    APPEND `-189107671498|K067900:120538,K744076:8048,K761096:862027,K152666:51674,K261456:107424,K120848:0,K592158:574755`
        && `,K249732:701286,K883774:24773,K459830:821482,K269927:627056|-5846189330,-390334432,-41808998402,-2506230296,-5`
        && `210149850,0,-27876076824,-34012931444,-1201510298,-39842533500,-30412717122` TO rt_cases.
    APPEND `-761863281457|K749443:538162,K315746:295465,K350426:807034,K387662:265013,K160476:265743,K320062:684689,K59011`
        && `1:0,K550928:0,K786803:799747,K008548:814869,K276638:454137|-83252305756,-45707691216,-124846126861,-4099684352`
        && `6,-41109772687,-105919663551,0,0,-123718846317,-126058181625,-70253849918` TO rt_cases.
    APPEND `786333538545|K531998:300410,K503186:674111,K058555:222843,K265293:908051,K275155:297095,K083864:851674,K298111`
        && `:57898,K007665:0,K123545:163401,K241569:850656,K969877:655654,K358267:0,K422088:880476,K620918:89946|396864794`
        && `56,89055265645,29439280122,119960545109,39248542372,112512708312,7648772636,0,21586533170,112378222656,8661695`
        && `3501,0,116317674795,11882560771` TO rt_cases.
    APPEND `666061665414|K205213:627376,K258824:65676,K173621:0,K048661:598607,K941625:331375,K904424:532323,K585104:50015`
        && `5,K262270:961091,K261458:0,K428746:843132,K094440:655611,K153566:0|81689704548,8551575189,0,77943735448,431478`
        && `50483,69312993474,65124445593,125142242983,0,109782975401,85366142295,0` TO rt_cases.
    APPEND `513245939223|K895864:0,K547898:543397|0,513245939223` TO rt_cases.
    APPEND `-597534478234|K342628:737857,K434018:580366,K434393:0|-334461618031,-263072860203,0` TO rt_cases.
    APPEND `878530237805|K852807:0,K959558:213212,K969695:0,K048336:104999,K774963:0,K545845:698738,K410995:368257,K056309`
        && `:0,K210935:23852,K846716:159061,K826162:707036,K910968:480556,K291837:575352,K186326:576586|0,47935008764,0,23`
        && `606213465,0,157092528347,82792725187,0,5362483486,35760606481,158958111442,108040148171,129352490303,129629922`
        && `159` TO rt_cases.
    APPEND `721271847167|K830355:892925,K408857:783519,K119102:264689,K156220:240930,K995116:604125,K980586:233958,K586471`
        && `:171902,K504601:206209,K626192:0|189521176336,166300016867,56179601471,51136811059,128224073303,49657020884,36`
        && `485784645,43767362602,0` TO rt_cases.
    APPEND `181854795011|K540538:0,K491361:0,K647438:829633,K442375:138801|0,0,155790419532,26064375479` TO rt_cases.
    APPEND `-785411617991|K396821:110262,K935529:877733,K264156:42593,K673741:0,K892294:521364,K154509:36387,K336940:0,K13`
        && `5706:269455,K558017:515842|-36484556108,-290432777264,-14093583450,0,-172513958670,-12040082196,0,-89159874356`
        && `,-170686785947` TO rt_cases.
    APPEND `658465962092|K918704:920160,K064474:248050,K716710:483767,K853993:310721,K142051:486218,K632108:876834,K961931`
        && `:631781,K571072:656025,K077321:286853,K636685:0,K320604:151861|119925110827,32328533886,63049699063,4049649013`
        && `4,63369139645,114278402264,82340469531,85500207388,37385756625,0,19792152729` TO rt_cases.
    APPEND `-656160155417|K880383:655280,K396502:902128,K451312:317330,K524898:166625,K553297:383776,K317886:785887,K34651`
        && `9:0,K918058:736830|-108911932614,-149939726445,-52742375132,-27694192974,-63786146153,-130619692324,0,-1224660`
        && `89775` TO rt_cases.
    APPEND `-765275027152|K070036:658868,K140887:166412,K071779:229698,K647305:360323,K576521:272197,K736060:589288,K71361`
        && `3:333506,K622739:0,K492678:94729,K842582:745403|-146131381705,-36908782172,-50945084774,-79916611294,-60371005`
        && `582,-130699122833,-73968826210,0,-21010095585,-165324116997` TO rt_cases.
    APPEND `529766992817|K857283:0,K575271:242253,K922374:0|0,529766992817,0` TO rt_cases.
    APPEND `-312930942556|K126353:574024,K172979:220215,K542176:212507,K507880:430404,K265350:882507,K134587:791168,K02177`
        && `9:168959,K117532:0,K018594:97911,K769249:643681|-44668758000,-17136444718,-16536632190,-33492697375,-686739432`
        && `78,-61566227073,-13147862603,0,-7619128755,-50089248564` TO rt_cases.
    APPEND `386857087700|K331336:0,K483836:701357,K712193:652278,K321725:987032,K651411:300182,K250072:0,K717480:822900,K0`
        && `68899:467860,K687860:855587|0,56677212811,52711100078,79762835068,24257944379,0,66499198585,37808135922,691406`
        && `60857` TO rt_cases.
    APPEND `-504304088820|K349724:124738,K017972:926682,K722913:949101,K644097:815464,K480864:739461,K024560:652752,K96746`
        && `0:154874,K932469:619553,K986067:639762,K516847:980133,K493089:0,K943693:0|-9527556665,-70780478005,-7249285348`
        && `7,-62285586334,-56480435625,-49857554780,-11829360828,-47321797002,-48865371475,-74863094619,0,0` TO rt_cases.
    APPEND `-185576352835|K886815:189395,K552176:84193|-128467744730,-57108608105` TO rt_cases.
    APPEND `564047481407|K559566:548847,K677711:0,K710131:840036,K221654:0,K780817:414832,K904148:812624|118324027593,0,18`
        && `1100457583,0,89432196977,175190799254` TO rt_cases.
    APPEND `361250429252|K143782:151930,K903907:0,K188522:287119,K511771:504395,K986076:372274,K538496:83726,K359233:59538`
        && `1,K815513:855629,K504392:319104,K176002:248823,K415803:289435,K307718:509371,K158488:549256|11514829343,0,2176`
        && `0852274,38228278459,28214780351,6345623653,45124140123,64848429642,24185006928,18858384661,21936382747,3860541`
        && `1288,41628309783` TO rt_cases.
    APPEND `584156323067|K833510:591919,K948486:917052,K531599:890208,K839147:334409,K643118:842804,K618617:166253,K735835`
        && `:0|92387396238,143134527689,138944685388,52194940167,131545814713,25948958872,0` TO rt_cases.
  ENDMETHOD.

  METHOD kernel_cases_02.
    APPEND `483212375427|K496101:0,K022718:961027,K888505:912626,K691875:0,K504917:167041,K730027:0,K362965:602968|0,17565`
        && `7909188,166811104194,0,30531996301,0,110211365744` TO rt_cases.
    APPEND `163425389712|K921910:132750,K829872:112723|88379253459,75046136253` TO rt_cases.
    APPEND `-267564836747|K160730:78772,K912084:761400|-25086074423,-242478762324` TO rt_cases.
    APPEND `263891181723|K596781:247996,K925397:676043|70823804518,193067377205` TO rt_cases.
    APPEND `426091363440|K880855:534761|426091363440` TO rt_cases.
    APPEND `-104029507493|K967868:689252,K697939:671946,K598865:452025,K097696:775397,K776015:17425,K005709:623758,K037142`
        && `:324349,K310775:218863,K654738:703365,K215942:561894,K679349:0,K429620:687607,K469778:435367,K564230:926297|-1`
        && `0116697121,-9862683262,-6634728686,-11381115467,-255760516,-9155389847,-4760726983,-3212425473,-10323844792,-8`
        && `247362956,0,-10092552155,-6390226036,-13595994199` TO rt_cases.
    APPEND `-936688526050|K613284:195515,K597280:692492,K947178:432633,K886174:233414|-117844461757,-417391744934,-2607646`
        && `62676,-140687656683` TO rt_cases.
    APPEND `463287375070|K239056:675687|463287375070` TO rt_cases.
    APPEND `-180504872534|K144558:0,K676516:664997,K044407:234064,K105454:728919,K408973:26048,K839825:0|0,-72571442999,-2`
        && `5543517090,-79547281656,-2842630789,0` TO rt_cases.
    APPEND `934398342873|K392910:551992,K862612:847737,K042748:911971,K850535:0,K318012:18975,K004443:33501,K994354:562483`
        && `,K504378:846121,K027440:813152,K794717:238536|106909282035,164188890462,176629670079,0,3675059832,6488441603,1`
        && `08941168870,163875905130,157490500777,46199424085` TO rt_cases.
    APPEND `674203368494|K443409:836246,K776967:0,K282125:110649,K605976:161322|508745011211,0,67315271757,98143085526` TO rt_cases.
    APPEND `-318968628397|K186048:0,K817958:154201,K171849:926143,K775937:0,K067906:287732,K486926:455161,K239583:349210,K`
        && `176786:243933,K714814:799575,K966848:171764,K710943:0,K828421:830028|0,-11661505886,-70039896279,0,-2175983561`
        && `5,-34421713742,-26409131397,-18447520544,-60468145920,-12989714055,0,-62771164959` TO rt_cases.
    APPEND `379436316040|K305388:144291,K510930:0,K020494:228616,K839849:823315,K654045:0,K294354:91792,K467695:0,K478079:`
        && `533552,K706646:173751,K588108:638511,K006779:0|20786947924,0,32935033278,118608964040,0,13223801373,0,76864930`
        && `169,25031034429,91985604827,0` TO rt_cases.
    APPEND `-264604227220|K024417:453092,K204076:409337|-139014409905,-125589817315` TO rt_cases.
    APPEND `-361321070281|K413460:0,K098657:88247,K193664:766575,K969200:0,K925338:731533,K703805:652930,K718392:775812,K8`
        && `00249:66462,K656944:999690|0,-7812681973,-67866405468,0,-64764067693,-57805188171,-68684175402,-5884012706,-88`
        && `504538868` TO rt_cases.
    APPEND `380239203121|K647032:87427,K388565:37927,K390822:795748|36090653165,15656607256,328491942700` TO rt_cases.
    APPEND `-901390145713|K605599:968846,K016588:301395|-687513815972,-213876329741` TO rt_cases.
    APPEND `381958658153|K534694:24773,K676698:78928,K110780:476182,K862072:373923,K595578:247754,K024468:961088|437531296`
        && `8,13939962939,84101452366,66040857011,43757368463,169743704406` TO rt_cases.
    APPEND `197659632430|K487211:89940,K266196:0,K414351:206844,K281059:116031,K833685:492004,K630421:939741,K875198:94699`
        && `2,K536302:621601,K669978:928863,K986980:818741,K050299:927009,K647019:567745,K133200:0,K149831:374390|25288417`
        && `78,0,5815829983,3262442076,13833669890,26422685133,26626561403,17477547006,26116828552,23020529751,26064699659`
        && `,15963278574,0,10526718625` TO rt_cases.
    APPEND `-758038788356|K115408:918578,K827772:276818,K101535:602563,K472462:812509,K277849:0|-266740582198,-80383586895`
        && `,-174974803916,-235939815347,0` TO rt_cases.
    APPEND `372955082790|K072944:228865,K192278:0,K550204:403892,K608054:0,K135317:218751,K728110:843576,K986966:968169,K3`
        && `90606:0,K975925:356365,K350808:497840|24266491603,0,42824555204,0,23194107027,89444126105,102654686865,0,37785`
        && `280756,52785835230` TO rt_cases.
    APPEND `236647683948|K769153:0,K344673:293080,K654179:410587,K581542:250258,K138458:444652,K845997:70113,K629837:88554`
        && `2,K685889:838094,K491183:0,K000099:0|0,21726071589,30436886023,18551669250,32962130422,5197488936,65645383128,`
        && `62128054600,0,0` TO rt_cases.
    APPEND `165880487787|K536494:300153|165880487787` TO rt_cases.
    APPEND `-725542256789|K634996:99155,K615353:340099,K481514:761475,K929389:0,K832337:410696,K917853:241906,K891642:1483`
        && `22|-35940866110,-123276210208,-276013020233,0,-148865613917,-87684041725,-53762504596` TO rt_cases.
    APPEND `-798228376143|K181732:387937,K788768:878218,K032055:781063,K178235:712434,K058066:0,K740558:512071,K243531:442`
        && `428,K662687:156197,K613727:381524,K516179:894217,K107439:494255,K675902:111167,K707072:0,K536978:0|-5384016853`
        && `3,-121884236688,-108400496870,-98875762374,0,-71068211953,-61402748600,-21677934315,-52950134839,-124104671595`
        && `,-68595603147,-15428407229,0,0` TO rt_cases.
    APPEND `11008960507|K596163:685886,K188329:949248,K418987:201965,K111978:0,K307845:108191,K995475:769586,K290805:85776`
        && `2,K452162:450649|1876796730,2597436808,552638852,0,296044117,2105825878,2347102750,1233115372` TO rt_cases.
    APPEND `93453761616|K636985:860438,K991758:178716,K224232:0,K117384:88745,K509365:779882,K250967:491882,K893524:0|3350`
        && `9358496,6960011661,0,3456132830,30372142470,19156116159,0` TO rt_cases.
    APPEND `-846751127472|K910041:0,K761679:957869,K246285:392489|0,-600638242392,-246112885080` TO rt_cases.
    APPEND `614729726197|K234235:646450,K444179:264645,K267178:84414,K634167:0,K171414:723696,K833435:0|231148717867,94628`
        && `126599,30183599458,0,258769282273,0` TO rt_cases.
    APPEND `-291408026873|K519643:0,K949882:253762,K264635:998378,K509615:0,K314410:712239|0,-37644611206,-148105514798,0,`
        && `-105657900869` TO rt_cases.
    APPEND `-571134898481|K171708:660361,K763328:899414,K922686:0,K146169:21994,K896802:14002,K816505:0,K476626:433459,K07`
        && `1444:0,K820348:218893|-167764491843,-228495826777,0,-5587568366,-3557203431,0,-110120114407,0,-55609693657` TO rt_cases.
    APPEND `653790410723|K756883:0,K193749:596980,K200877:904883,K030319:200865,K553958:417293,K428763:968394,K766243:6678`
        && `99|0,103904998196,157495839865,34960764955,72630286462,168549996353,116248524892` TO rt_cases.
    APPEND `879014066186|K245126:400474,K216734:0,K224452:411663,K628016:360478|300202776821,0,308590259828,270221029537` TO rt_cases.
    APPEND `670688304543|K555802:871050,K311092:41332,K408145:0,K897574:0|640305319123,30382985420,0,0` TO rt_cases.
    APPEND `-537109829365|K098138:365101,K543471:458913|-237980587479,-299129241886` TO rt_cases.
    APPEND `-614432639643|K173865:0,K348431:347599|0,-614432639643` TO rt_cases.
    APPEND `987526956809|K834381:75192,K004705:185718,K492264:0,K764495:36609,K253363:916417,K274252:767955,K778574:103512`
        && `,K574025:0,K974858:625500,K722925:133020,K926960:132294,K775510:831483|19501044446,48165961437,0,9494543783,23`
        && `7672739758,199169121548,26845836162,0,162223418726,34498735666,34310447573,215645107710` TO rt_cases.
    APPEND `-919760756351|K311752:144094,K621559:685373,K951664:771886,K415510:176988,K679536:269869,K829934:456112,K13120`
        && `4:0,K073359:799324,K204758:173400,K431015:623597,K704170:531136,K057135:873847|-24072104866,-114497277669,-128`
        && `949996091,-29567321999,-45083867948,-76197314910,0,-133533742904,-28967916664,-104177081476,-88730700030,-1459`
        && `83431794` TO rt_cases.
    APPEND `109659494886|K741854:0,K875818:0,K015880:493754,K631596:649264,K752821:5392,K611036:508767,K832308:0,K072767:2`
        && `65038,K741513:456630,K571678:17641,K814894:191978,K646742:244225,K732709:0,K774825:791229|0,0,14940960098,1964`
        && `6681378,163161528,15395252386,0,8020030587,13817590561,533815376,5809240305,7390230722,0,23942531945` TO rt_cases.
    APPEND `785432940044|K543893:99316|785432940044` TO rt_cases.
    APPEND `324596249188|K883694:481578,K302600:0,K759025:883607,K395935:40956,K384169:0,K525472:646458,K461302:166825,K32`
        && `6587:875620|50506038845,0,92669286109,4295306943,0,67798015814,17495961050,91831640427` TO rt_cases.
    APPEND `-811919624139|K807002:640165,K968189:160864,K623106:212274|-512938900000,-128893962041,-170086762098` TO rt_cases.
    APPEND `-602958711293|K281391:361905,K742854:827831,K828038:907380,K334046:777882,K248639:672740,K817808:865726,K45765`
        && `3:832887,K275324:557441,K226988:695773,K798211:0,K119778:530434,K924467:13498,K640880:724443|-28091588299,-642`
        && `57436711,-70432144874,-60380323259,-52219049508,-67198901291,-64649890727,-43269374761,-54006904203,0,-4117305`
        && `2452,-1047734237,-56232310971` TO rt_cases.
    APPEND `722029820644|K936850:800411,K171987:970742,K724676:104813,K345019:31705,K060592:767933,K928908:331205|19220396`
        && `4659,233105818212,25168912156,7613372005,184404970936,79532782676` TO rt_cases.
    APPEND `189507074451|K418814:475463,K136986:497356,K923280:549584,K654163:527168,K406697:0,K978747:319808,K255800:6353`
        && `20,K551528:0|29987563526,31368360199,34662392474,33248610069,0,20170365972,40069782211,0` TO rt_cases.
    APPEND `-133770307642|K128284:0,K336486:0,K419011:0,K384276:690150|0,0,0,-133770307642` TO rt_cases.
    APPEND `122773630200|K255012:496113,K639802:844162,K745670:888863,K520964:810393,K815802:678269|16383235784,2787692539`
        && `1,29353095180,26761765156,22398608689` TO rt_cases.
    APPEND `237866032792|K802285:471062,K787886:161505,K614667:418935,K692849:0,K740116:206170,K923459:7433,K137421:55950,`
        && `K325762:0,K375355:751475,K267471:936298,K516231:267311,K478868:867498|27041376728,9271215994,24049019363,0,118`
        && `35216256,426692353,3211817187,0,43138522267,53748311151,15345023488,49798838005` TO rt_cases.
    APPEND `233566849877|K186099:424608,K679379:426616,K088031:0,K478400:919795,K085250:250127,K024063:647749,K501265:4208`
        && `80,K209840:530078,K750303:876637,K366385:647294|19280427209,19371605656,0,41765676919,11357664991,29412722898,`
        && `19111147703,24069566033,39805976024,29392062444` TO rt_cases.
    APPEND `234996295363|K475473:305063,K854574:724307,K324997:0,K759338:618556,K676669:124461,K182029:994357,K075398:7266`
        && `18|20521398828,48723682718,0,41609878528,8372414287,66889778748,48879142254` TO rt_cases.
    APPEND `790899630099|K642765:221487,K290956:304912|332777961911,458121668188` TO rt_cases.
    APPEND `566739789105|K114820:448429,K392753:613953,K397479:107321,K182004:811918,K252963:273679,K639889:364662,K184250`
        && `:199636,K866573:688732,K944612:191188,K633901:573152,K661409:589388,K750700:0,K487787:301125|49222070356,67390`
        && `908620,11780152070,89120652142,30040534830,40027336814,21913161811,75599069107,20985862171,62912363092,6469451`
        && `7088,0,33053161004` TO rt_cases.
    APPEND `330276077429|K920477:0,K363698:112908,K731973:275487,K947017:0,K227290:495325,K057128:343888,K260756:0,K075409`
        && `:182768,K020848:992366|0,15520106341,37867888330,0,68086377169,47270152066,0,25122921279,136408632244` TO rt_cases.
    APPEND `-983109306813|K773686:786518,K526680:702225,K290969:0,K672663:73811,K055887:565146,K483150:0,K706752:361025,K0`
        && `32897:543744,K822173:928665,K909348:862860|-160288998240,-143110446028,0,-15042365526,-115174333200,0,-7357534`
        && `8040,-110812697305,-189257947753,-175847170721` TO rt_cases.
    APPEND `906279369343|K172957:0,K669032:325425|0,906279369343` TO rt_cases.
    APPEND `553638643951|K646868:129710,K206277:245181,K266910:477718,K303519:0,K003776:0,K094891:321308,K566067:793237,K2`
        && `18096:0,K351128:28003,K381071:777523,K670264:807267,K247346:170876,K281541:37845,K765038:540268|16588942065,31`
        && `356822176,61096571008,0,0,41092897980,101449099042,0,3581374949,99439395584,103243431454,21853766589,484009338`
        && `1,69096249723` TO rt_cases.
    APPEND `-708941194238|K317670:260589,K736250:148371,K603802:0,K377382:222471,K425141:841990,K086384:224183,K354791:0,K`
        && `004805:0,K038012:853290,K180094:887133|-53734969756,-30594964475,0,-45874816115,-173623242673,-46227840488,0,0`
        && `,-175953368496,-182931992235` TO rt_cases.
    APPEND `303679616940|K418234:145723,K615852:397017,K698996:297753,K732779:971421,K701853:296291,K435575:0,K651317:7765`
        && `82,K473737:740890,K352742:672977,K951881:0,K563523:0,K454728:113944,K378039:130377,K763514:324066|9092404362,2`
        && `4771924148,18578334759,60611931802,18487113090,0,48454928628,46227921933,41990482014,0,0,7109549780,8134888820`
        && `,20220137604` TO rt_cases.
    APPEND `-72887111443|K381231:0,K091153:318025,K996486:999710,K136050:258926,K681407:639866,K386727:152178,K230851:0,K1`
        && `33889:838900,K112656:406244|0,-6414192629,-20162982510,-5222234857,-12905349518,-3069252436,0,-16919632721,-81`
        && `93466772` TO rt_cases.
    APPEND `-722506187521|K676285:793270,K261494:331673,K437082:929390,K813678:0,K258397:710799,K079720:670722,K821903:0,K`
        && `708963:400671,K323468:0,K278409:67573,K353740:845062,K701249:503903,K359420:602530|-97879494592,-40924257327,-`
        && `114674982639,0,-87703615259,-82758619854,0,-49437738699,0,-8337654377,-104269972971,-62175263105,-74344588698` TO rt_cases.
    APPEND `549487245659|K653607:0,K252914:106858|0,549487245659` TO rt_cases.
    APPEND `-120816014361|K548646:797311,K688364:973486,K025068:572854,K562712:469903,K724551:537031,K576726:521546,K29139`
        && `5:575025,K867308:24253,K097472:148132,K505424:941208,K502457:319957,K356123:195932|-15852176356,-19354896335,-`
        && `11389511287,-9342634463,-10677276647,-10369403118,-11432675216,-482199334,-2945167680,-18713143558,-6361400746`
        && `,-3895529621` TO rt_cases.
    APPEND `-855990572514|K762553:534943,K726159:974180,K461705:271733,K641483:0,K380969:50452,K816359:343030,K312372:8356`
        && `65,K722518:151809,K921294:117473,K078002:0,K753918:558439,K126568:370245,K161631:66259,K647160:371518|-9856461`
        && `4775,-179495154477,-50067499653,0,-9295909928,-63204154099,-153973411758,-27971196192,-21644700447,0,-10289381`
        && `2818,-68218587396,-12208390072,-68453140899` TO rt_cases.
    APPEND `-923043681015|K610315:177875,K516020:782455,K249261:0,K738090:0,K566591:40620,K293043:503792,K051941:395716,K3`
        && `59978:280859,K504030:34113,K308858:0,K576137:419708,K083848:46723,K539936:0,K101006:325000|-54603919090,-24019`
        && `7383061,0,0,-12469493709,-154653647823,-121476567516,-86217861486,-10471980278,0,-128841611658,-14342987557,0,`
        && `-99768228837` TO rt_cases.
    APPEND `-787011552364|K271358:184211,K091890:48501,K691544:163277,K292286:0,K713409:112503,K800894:500096,K463075:0|-1`
        && `43741731086,-37845827336,-127406716355,0,-87787243826,-390230033761,0` TO rt_cases.
    APPEND `-333961717590|K270880:0,K736472:494294,K821890:241045,K820195:433659,K654295:282308,K027596:90293|0,-107080552`
        && `877,-52218379888,-93944991199,-61157320788,-19560472838` TO rt_cases.
    APPEND `-447066889886|K976277:458636,K342106:0,K771002:0,K464748:883265,K338622:296705,K045814:0,K496570:36536,K827116`
        && `:482328,K070251:81815,K480744:436041,K680902:0,K451596:930393|-56865487885,0,0,-109514506398,-36787942034,0,-4`
        && `530035726,-59803018168,-10144100967,-54063972743,0,-115357825965` TO rt_cases.
    APPEND `908893617756|K180763:453231,K636147:407482,K007136:817456,K231431:202507,K137904:780364,K793981:88341,K648968:`
        && `530233|125605868029,112927249716,226545118174,56121641099,216265651728,24482323556,146945765454` TO rt_cases.
    APPEND `444893429897|K056722:320532,K216505:351936,K330607:929501,K214475:696533,K924998:801725,K576271:162388,K227471`
        && `:714482,K544894:670722,K332194:83274,K014418:160214,K212600:801200,K475434:58291,K228291:586264,K480232:255142`
        && `|21632003632,23751390907,62729989543,47007488756,54106666766,10959210955,48218827509,45265560818,5619980128,10`
        && `812492450,54071235665,3933932100,39565675119,17218975549` TO rt_cases.
    APPEND `423582575795|K926304:656653,K595638:784824,K762068:0,K777864:560230|138954786661,166077138895,0,118550650239` TO rt_cases.
    APPEND `381013593137|K289224:377410,K920499:0,K327800:958344,K936380:880628,K023946:379640,K409864:339888,K763703:9367`
        && `80,K621473:189517|35399067597,0,89887613039,82598262102,35608229836,31879701882,87865023565,17775695116` TO rt_cases.
    APPEND `593581843331|K879706:72043,K590469:230169,K429642:724037,K596516:0,K177334:133197,K905141:892592,K399237:66257`
        && `0,K069928:397459,K377726:536669,K452358:0,K774408:278983,K719437:532362,K095491:740684|8222524328,26270008220,`
        && `82636923049,0,15202248282,101874705875,75621475290,45363412088,61251945489,0,31841323997,60760372230,845369044`
        && `83` TO rt_cases.
    APPEND `996508091066|K340109:245602,K686510:196695,K152062:959411,K859247:0,K953422:311731,K571648:0,K954205:611948,K0`
        && `94296:991371,K258459:84106,K367729:230626,K622995:328980,K288501:356886,K520477:0,K689461:385109|52045975926,4`
        && `1682002731,203310566726,0,66059495123,0,129679037124,210083269678,17823058653,48872383954,69714762747,75628375`
        && `031,0,81609163373` TO rt_cases.
    APPEND `-872706736873|K126716:85948,K195514:0,K095287:801702,K067726:159844|-71606518625,0,-667928156500,-133172061748` TO rt_cases.
    APPEND `28417145732|K445865:540292,K025087:978277,K499434:0,K985028:68503,K188029:35014,K336772:0,K254451:0,K928910:44`
        && `9555,K243871:955981,K996127:0,K591449:985116|3826204577,6927898127,0,485120069,247959857,0,0,3183629220,677000`
        && `3772,0,6976330110` TO rt_cases.
    APPEND `901414211181|K159853:935577,K069904:721793,K778540:265240,K562498:30576,K135860:244135,K973906:32430|378222682`
        && `019,291796917114,107227715280,12360860437,98695665322,13110371009` TO rt_cases.
    APPEND `-221297611129|K923551:0,K774622:523784,K771896:0,K743187:441523,K651360:0,K977582:0,K501529:734105,K313181:986`
        && `961,K940257:0|0,-43148195708,0,-36371712029,0,0,-60473985860,-81303717532,0` TO rt_cases.
    APPEND `-229649117878|K923875:830239,K083120:166471,K181962:391903,K351077:58517,K070836:851082,K260834:510599,K364060`
        && `:309057,K779920:843037,K144105:656165,K433315:636225,K584841:660496,K589498:900250,K487351:0|-27980996002,-561`
        && `0462030,-13208047654,-1972159755,-28683453848,-17208380451,-10415943700,-28412318533,-22114295090,-21442270456`
        && `,-22260259920,-30340530439,0` TO rt_cases.
    APPEND `-429402012084|K210474:773708,K982655:519110,K818229:480506,K567972:726148,K156899:851959,K270210:154465|-94763`
        && `727151,-63580573552,-58852357063,-88938580115,-104347906730,-18918867473` TO rt_cases.
    APPEND `297455634029|K296379:0,K374262:639409,K876408:507756,K415487:949212,K128252:0,K073781:377815,K706137:147663,K4`
        && `74600:0,K542479:360999,K743070:0,K403005:585973,K127570:399834|0,47924428289,38056886923,71144513802,0,2831766`
        && `1894,11067508988,0,27057283660,0,43919339606,29968010867` TO rt_cases.
    APPEND `-443745992899|K130004:930282,K711609:463991,K854921:731532,K371679:209165,K922987:407053,K211180:185410,K55672`
        && `3:690707,K683901:470735,K401701:565636,K345906:783423,K813859:275921|-72247004827,-36034191801,-56811801083,-1`
        && `6244047251,-31612306866,-14399200635,-53641274327,-36557940299,-43928085056,-60841728919,-21428411835` TO rt_cases.
    APPEND `-207592282317|K298530:424461,K708156:465477,K946244:368766,K455490:953333,K390970:0,K927709:66845,K633743:9125`
        && `7,K191834:18886,K052101:600223,K979741:358527,K080500:816955|-21157392615,-23201848090,-18381257748,-475191845`
        && `04,0,-3331910139,-4548733989,-941378635,-29918305021,-17870891559,-40721380017` TO rt_cases.
    APPEND `-731338061318|K502787:0,K452336:654757,K169663:63962,K718720:276293,K493984:282565,K176235:931661,K318791:6191`
        && `61,K235850:432622,K503652:434746,K641963:134709,K876128:269605,K910548:505481|0,-103971831237,-10156815841,-43`
        && `873817566,-44869776869,-147942672261,-98319381084,-68698007922,-69035287508,-21391052580,-42811799737,-8026761`
        && `8713` TO rt_cases.
    APPEND `538624804471|K127674:809996,K973534:0,K043309:0,K051780:716196|285864384771,0,0,252760419700` TO rt_cases.
    APPEND `-112426786242|K333138:71720,K468277:752393,K655807:603668,K513355:934529,K173734:816395,K565919:646795,K304264`
        && `:294310,K745013:390995,K871852:464163,K039494:233384,K411372:0,K589849:830879,K975464:0,K131857:163461|-129995`
        && `9616,-13637486269,-10941773862,-16938789177,-14797553410,-11723471552,-5334510799,-7086973090,-8413178404,-423`
        && `0197643,0,-15060082900,0,-2962809520` TO rt_cases.
    APPEND `-420375407523|K185717:17488,K368551:453806,K088212:0,K220388:212366,K024540:885363,K924871:0,K223371:933863,K0`
        && `36191:0,K079293:644851,K278813:125601,K185007:0,K723246:3681,K076299:725645,K900648:345096|-1690876481,-438775`
        && `09841,0,-20533204177,-85603812522,0,-90293171471,0,-62349233149,-12144086049,0,-355907841,-70161028344,-333665`
        && `77648` TO rt_cases.
    APPEND `-95431695128|K040459:923182,K032682:235662,K357310:160454,K164157:22772,K172897:489083,K910716:952524,K745164:`
        && `551532|-26415383016,-6743092903,-4591135731,-651584522,-13994331314,-27254957626,-15781210016` TO rt_cases.
    APPEND `-628967959451|K714977:0,K798036:781830,K143445:78333,K155763:939185,K517953:0,K122431:433645,K112038:699840,K7`
        && `68417:0,K465658:151251,K969805:278438,K080118:82818,K308918:920922|0,-112624029373,-11284010709,-135291302491,`
        && `0,-62467348679,-100813221181,0,-21787980848,-40109498856,-11930083093,-132660484221` TO rt_cases.
    APPEND `-871971931571|K550681:611727,K100914:544118,K030526:762700,K904603:134597,K552396:814700,K648896:20363,K081113`
        && `:487332,K223616:474265,K577389:607988|-119657672027,-106432923817,-149188946139,-26328024890,-159360475180,-39`
        && `83131651,-95325222892,-92769235008,-118926299967` TO rt_cases.
    APPEND `-718741591316|K344221:593391,K835865:77339|-635866580610,-82875010706` TO rt_cases.
    APPEND `-946744105225|K032721:0,K561372:232522,K371304:0,K997148:380754,K867143:542412,K527973:602212,K744668:0,K24752`
        && `1:158048,K390378:652823,K352200:567283,K416359:933740,K369467:860034|0,-44654465193,0,-73121537920,-1041669939`
        && `81,-115651227811,0,-30352177062,-125370768920,-108943321399,-179319205622,-165164407317` TO rt_cases.
    APPEND `389142997156|K160949:150289,K256734:0,K733948:185347,K790869:960249,K606277:516007,K421034:36620,K477283:74325`
        && `8,K774361:725460,K123802:0,K045295:366749,K461829:992273|12506578324,0,15423994920,79908904370,42940481080,304`
        && `7401328,61851595205,60370501572,0,30519699337,82573841020` TO rt_cases.
    APPEND `-891784807992|K801025:0,K376905:141420,K349652:489561,K260047:353157,K120511:923424,K651765:800474,K085084:395`
        && `621,K806253:965672,K679793:941219,K524144:400225,K619930:677764,K235535:618841,K515926:88479,K717185:86480|0,-`
        && `18324619609,-63435292748,-45760625705,-119653468660,-103722115379,-51262935471,-125127790037,-121959271276,-51`
        && `859502779,-87821860308,-80186861289,-11464743448,-11205721283` TO rt_cases.
    APPEND `-640976041383|K266084:187559,K674187:775195,K524883:0,K808209:943622,K598533:0,K432792:886894|-43039457462,-17`
        && `7885210667,0,-216534418127,0,-203516955127` TO rt_cases.
    APPEND `-419499050321|K361652:947587,K285030:890455,K350464:308899,K605819:608239,K855887:726556,K284731:0,K389120:683`
        && `315,K797898:77518,K877164:609152|-81932132247,-76992272815,-26708633317,-52590757562,-62820914889,0,-590821264`
        && `39,-6702513888,-52669699164` TO rt_cases.
    APPEND `943642722567|K160816:157990,K442192:0,K064246:368759,K640705:937579|101811966812,0,237635793846,604194961909` TO rt_cases.
    APPEND `492785823447|K141888:497387,K777771:881186,K535152:473467,K624861:863010|90276518800,159936637859,85935001370,`
        && `156637665418` TO rt_cases.
    APPEND `-905779404529|K878796:0,K024354:171632,K040876:0,K594990:50554,K393584:3468,K966060:164455,K443910:0,K742558:0`
        && `,K065800:0,K776787:220351,K207552:0,K175079:209852,K212039:0|0,-189514149200,0,-55821165625,-3829327103,-18158`
        && `9385468,0,0,0,-243309128194,0,-231716248939,0` TO rt_cases.
    APPEND `743261505117|K248742:617582,K097123:401436,K367016:324337|341700389587,222109513545,179451601985` TO rt_cases.
    APPEND `-252266081137|K300025:687221,K572637:0,K897649:46027,K401468:953037|-102807383417,0,-6885580383,-142573117337` TO rt_cases.
  ENDMETHOD.

  METHOD kernel_cases_03.
    APPEND `-890679979606|K600746:401045,K804825:848885,K664206:380002|-219151935431,-463875103064,-207652941111` TO rt_cases.
    APPEND `-28451107046|K036939:12169,K514896:352019|-950667023,-27500440023` TO rt_cases.
    APPEND `398598512160|K517804:371511,K162026:316479,K559427:0,K612949:0,K326083:415040,K087644:805711,K442546:793853|54`
        && `793184567,46676658991,0,0,61213162793,118832205589,117083300220` TO rt_cases.
    APPEND `-851531145012|K903613:945002,K315183:0,K603557:883808,K230665:45009,K471654:0,K414571:503478,K842362:727425,K4`
        && `00251:912981|-200288233127,0,-187318484769,-9539422228,0,-106709529756,-154173925539,-193501549593` TO rt_cases.
    APPEND `-982836702168|K273385:165231,K476477:88772,K474513:787833,K636327:0,K492259:0,K328888:995762,K595485:952996,K2`
        && `36863:426395|-47525786924,-25533702252,-226606286289,0,0,-286413400870,-274112514210,-122645011623` TO rt_cases.
    APPEND `864726937973|K019820:0,K990247:493993,K133550:931831,K088828:855254,K178063:1758,K767324:309215|0,164799633291`
        && `,310865552930,285318912556,586481499,103156357697` TO rt_cases.
    APPEND `-202534663939|K209273:849859,K637654:181476,K619093:822148,K254183:531418,K937686:0|-72173187466,-15411616949,`
        && `-69819866270,-45129993254,0` TO rt_cases.
    APPEND `528576672048|K471771:0,K012298:0,K853675:315663,K818045:124087,K372667:723954,K864653:237983,K370230:135481,K4`
        && `49319:407129,K649413:430570|0,0,70257449377,27618175462,161131211152,52968129223,30154150151,90615134201,95832`
        && `422482` TO rt_cases.
    APPEND `-351154313975|K609324:411870,K862068:0,K592843:858511,K575314:0|-113847678214,0,-237306635761,0` TO rt_cases.
    APPEND `141445934274|K145599:929267,K938328:988532,K434832:319744|58743469513,62489897311,20212567450` TO rt_cases.
    APPEND `-483652145065|K446711:723906,K977562:393595,K594118:0,K904906:593369|-204643654822,-111266820996,0,-1677416692`
        && `47` TO rt_cases.
    APPEND `-175591549885|K450392:225043,K991040:131609,K024007:923905|-30858172780,-18046387852,-126686989253` TO rt_cases.
    APPEND `906981229377|K104292:0,K112056:949580,K762184:784835,K541580:0,K799787:560692,K803915:41997,K875212:0,K447966:`
        && `0,K532995:173410|0,343057730725,283539790321,0,202562949046,15172387284,0,0,62648372001` TO rt_cases.
    APPEND `431537743772|K478396:8309,K668493:899525,K012721:231634,K520266:589105,K189953:0,K720920:0,K241143:0,K553370:1`
        && `72943,K200026:15097,K234057:720640|1359614384,147190652154,37902625854,96396152567,0,0,0,28298927718,247034521`
        && `1,117919425884` TO rt_cases.
    APPEND `320051868320|K465324:0,K026882:344891,K653886:748229,K349101:297247,K627287:965266|0,46859170727,101659337164,`
        && `40385941996,131147418433` TO rt_cases.
    APPEND `624431773249|K906982:568837,K911700:473715,K266499:32394,K537725:656314,K762368:0,K848127:0|205168430276,17085`
        && `9776963,11683885068,236719680942,0,0` TO rt_cases.
    APPEND `-70793310512|K227494:688171,K354146:0,K932440:0,K706983:813031,K919447:486305|-24512066266,0,0,-28959473370,-1`
        && `7321770876` TO rt_cases.
    APPEND `436302280925|K225519:873476,K739005:367512|307093679498,129208601427` TO rt_cases.
    APPEND `-212960427258|K802047:155107,K604296:0,K317824:746672,K443460:456480,K807341:864615,K839517:865658,K682186:0,K`
        && `361965:5255,K943554:0,K122362:131128,K388128:154422,K150102:340948,K448484:791384,K331217:733115|-6298000640,0`
        && `,-30318043249,-18535019904,-35107028204,-35149378419,0,-213375240,0,-5324351757,-6270186741,-13843931753,-3213`
        && `3539678,-29767571673` TO rt_cases.
    APPEND `-331103928582|K616648:0,K534178:833679,K144781:856760,K434778:0,K686100:0,K761012:0,K605384:432453,K243154:176`
        && `470,K013395:0,K792198:202720,K096204:612947,K446283:955581|0,-67811554552,-69688965991,0,0,0,-35175781327,-143`
        && `54091961,0,-16489270257,-49857185953,-77727078541` TO rt_cases.
    APPEND `177299499098|K398458:904622|177299499098` TO rt_cases.
    APPEND `124144048002|K914947:0,K126482:312318|0,124144048002` TO rt_cases.
    APPEND `486229277250|K623775:334179,K570805:990949,K007496:419929,K106120:0,K487483:0,K295133:688833|66760459036,19796`
        && `6389632,83891126619,0,0,137611301963` TO rt_cases.
    APPEND `628708824466|K875242:449502,K368406:890225,K945796:0,K852235:816954,K222045:52892,K378069:140070,K960773:68118`
        && `3,K846273:656321,K639305:227002,K791180:313809,K184154:595501,K478965:0,K351469:0,K271218:475982|53327487562,1`
        && `05613462488,0,96920824099,6274938648,16617459284,80813384502,77863835899,26930795261,37229301637,70648344548,0`
        && `,0,56468990538` TO rt_cases.
    APPEND `-103613349414|K810323:138541,K713154:545100,K666741:536288,K446051:340180,K117178:0,K481523:109975,K094410:0,K`
        && `727461:930501,K665775:454152,K907829:787177,K035256:0,K541512:435025,K115709:552220|-2972504538,-11695543006,-`
        && `11506474715,-7298825573,0,-2359598866,0,-19964620184,-9744183172,-16889492674,0,-9333798562,-11848308124` TO rt_cases.
    APPEND `804894777065|K915383:712244,K764767:0|804894777065,0` TO rt_cases.
    APPEND `-704559176878|K822406:0,K265293:322164,K559085:77118,K458307:762924,K257202:671938|0,-123754515818,-2962373434`
        && `3,-293065923646,-258115003071` TO rt_cases.
    APPEND `477800334869|K495996:0,K303025:0,K695228:163466,K581187:0,K845887:806572,K817567:598795,K154946:0,K053196:1964`
        && `18,K370946:613034,K383249:429896,K820925:795437,K218719:173666|0,0,20677319878,0,102025786702,75743431396,0,24`
        && `845520267,77544566542,54378874546,100617286115,21967549423` TO rt_cases.
    APPEND `217562093710|K052457:418371,K533707:0,K836334:326011,K835061:89726,K113561:123507,K232969:725949,K121491:0,K99`
        && `7259:674607,K410952:511969,K794256:302933|28685652901,0,22352979504,6152072902,8468270824,49774771764,0,462545`
        && `01977,35103209902,20770633936` TO rt_cases.
    APPEND `-355660541666|K785266:0,K531164:275926,K691323:971413,K060300:833201,K491212:848343|0,-33506285714,-1179607631`
        && `17,-101177383657,-103016109178` TO rt_cases.
    APPEND `-723885607673|K931974:132881,K901472:0,K908420:96171,K070616:0,K445492:909457,K955271:500229|-58698000189,0,-4`
        && `2481960372,0,-401737698825,-220967948287` TO rt_cases.
    APPEND `-625927986426|K639736:0,K197563:842136,K478209:0,K192329:614473,K122426:358875,K472381:777794,K269881:361328|0`
        && `,-178405002487,0,-130175003910,-76027025643,-164774265088,-76546689298` TO rt_cases.
    APPEND `265600913688|K578381:556803,K283637:591863,K644606:0,K072870:610556,K490616:295417,K630534:0,K981562:335357,K0`
        && `34293:0,K507107:112160,K902978:95127|56939265203,60524537980,0,62436103982,30209655674,0,34293962426,0,1146960`
        && `0532,9727787891` TO rt_cases.
    APPEND `-462873641399|K062729:0,K699959:307099,K465298:701103,K320362:748117,K744528:0,K674809:130699,K633415:664120,K`
        && `455265:0,K188375:0|0,-55719460256,-127206798929,-135736929944,0,-23713778736,-120496673534,0,0` TO rt_cases.
    APPEND `538110738429|K412171:471266,K012542:0,K897907:701356,K555398:652369,K031315:390942,K342980:696211,K236191:5940`
        && `08,K188749:543015,K834625:785376,K265323:449734,K577153:641230|42796894047,0,63691966791,59243329612,355024622`
        && `03,63224735928,53943415055,49312607787,71322042030,40841516994,58231767982` TO rt_cases.
    APPEND `-286167799909|K320012:829077,K009167:0,K051630:114643,K979707:15815,K916810:0,K929823:0,K505298:844219,K044724`
        && `:0,K977078:15724,K055458:261612,K165857:582862,K069004:871685,K103415:141340|-64524510500,0,-8922311748,-12308`
        && `32762,0,0,-65702965744,0,-1223750512,-20360456557,-45362355052,-67840559966,-11000057068` TO rt_cases.
    APPEND `-733911742685|K921092:873701,K803749:839194|-374348353808,-359563388877` TO rt_cases.
    APPEND `472657145316|K012405:0,K191634:233590,K894392:0,K047044:0,K081933:842972,K148892:537660,K218259:808189,K155801`
        && `:368503,K200882:33364,K707383:75459,K263274:220231,K807238:0,K328086:0|0,35387536851,0,0,127705392844,81452386`
        && `932,122435969092,55826077710,5054453442,11431602993,33363725452,0,0` TO rt_cases.
    APPEND `854475406980|K463028:895010,K819704:0,K034413:117483,K359560:107050,K511063:654703,K186492:0|431036076170,0,56`
        && `579715687,51555191511,315304423612,0` TO rt_cases.
    APPEND `-23365883484|K273404:542810,K476806:0,K418928:290046|-15228605202,0,-8137278282` TO rt_cases.
    APPEND `-570566424106|K563684:588815,K421658:757568,K866195:971546|-144938895458,-186478043450,-239149485198` TO rt_cases.
    APPEND `205560707195|K476245:622755,K597152:0,K987668:0,K881050:0,K316897:799246,K796392:553362,K786773:0,K216512:8282`
        && `41,K429025:550371,K812617:965466,K705518:196472,K839208:691091,K094234:909977,K930075:885346|18281630979,0,0,0`
        && `,23462710751,16244526149,0,24313889609,16156722184,28342274466,5767643137,20287706458,26713336245,25990267217` TO rt_cases.
    APPEND `548879223703|K935798:658777,K935417:897854,K589358:178536,K227327:617726,K345201:0,K674728:919629,K138681:9105`
        && `04,K746481:554419,K769551:0,K905533:0|76325742748,104025145731,20685137470,71569583888,0,106547991927,10549077`
        && `1650,64234850289,0,0` TO rt_cases.
    APPEND `-174857553580|K040069:958317,K119877:765206,K362842:0,K000762:72013,K078585:283746,K795802:0,K792009:135660,K5`
        && `92073:0,K492231:120629|-71746466356,-57288795393,0,-5391408356,-21243255460,0,-10156478103,0,-9031149912` TO rt_cases.
    APPEND `-536811899827|K190734:0,K769337:0,K812680:0,K201309:277189,K315861:0,K392917:389659,K196840:182987,K572275:0,K`
        && `491538:479373,K252185:0,K089265:0,K048533:0|0,0,0,-111945123488,0,-157367084816,-73900848561,0,-193598842962,0`
        && `,0,0` TO rt_cases.
    APPEND `-847385729525|K527902:920044,K122376:0,K197597:32750,K883061:448524,K912158:609839,K009214:497639,K079893:3223`
        && `35|-275378340365,0,-9802401458,-134247704168,-182530891685,-148948313255,-96478078594` TO rt_cases.
    APPEND `555983289985|K148718:398881,K154555:22880,K906809:116755,K609376:89832,K109393:97191,K356264:390530|1987074013`
        && `28,11397949119,58162917366,44750898830,48416873810,194547249532` TO rt_cases.
    APPEND `-606317955882|K846457:686138,K054116:552118,K565409:234813,K998678:563187,K326990:794562,K351984:542436,K40962`
        && `5:860089,K451543:0|-98271694406,-79076762069,-33630947970,-80662112808,-113800655336,-77690063554,-12318571973`
        && `9,0` TO rt_cases.
    APPEND `-687179940842|K773774:216655,K018467:182363,K404869:757563,K205006:18645,K966758:797462,K429310:976230,K173277`
        && `:575691,K160268:107090,K339313:796381,K574258:995742,K536811:0,K447301:765138|-24055894703,-20248344722,-84114`
        && `632753,-2070213735,-88544745803,-108393926225,-63920805325,-11890543785,-88424718930,-110560405731,0,-84955709`
        && `130` TO rt_cases.
    APPEND `492084797853|K889269:471727,K748843:927452,K870907:716474,K351785:287873,K644728:906682,K069352:679476|5818247`
        && `3959,114391272577,88369395535,35506051861,111829515492,83806088429` TO rt_cases.
    APPEND `-95057456865|K311205:666703,K575200:46879,K448819:540615,K205236:450955,K286131:304776|-31531025820,-221709360`
        && `8,-25567824839,-21327448277,-14414064321` TO rt_cases.
    APPEND `-581813884094|K822972:0,K711003:2165,K934741:715506,K611530:546668,K600592:102011,K405092:0,K128529:293005,K04`
        && `2073:846315,K287758:0,K073817:671463,K643696:314741,K466768:764008|0,-295973210,-97815523305,-74733987547,-139`
        && `45738188,0,-40056180390,-115698183671,0,-91794484916,-43027669398,-104446143469` TO rt_cases.
    APPEND `-85617794942|K354952:962356,K448744:0,K432435:258565,K188271:774266,K487301:645391,K584211:326352,K120654:6908`
        && `03,K089225:554441|-19561109933,0,-5255662551,-15737941409,-13118393090,-6633519559,-14041449759,-11269718641` TO rt_cases.
    APPEND `-290086915326|K292952:556740,K293524:0,K339936:142022,K692386:262653,K683524:581971,K129302:988098|-6379775232`
        && `2,0,-16274534577,-30097839280,-66689014111,-113227775036` TO rt_cases.
    APPEND `313774575393|K996468:606727|313774575393` TO rt_cases.
    APPEND `-77360952407|K663766:822135,K630091:0,K640735:772798,K068309:197925,K501939:653691,K140281:708663,K121763:7113`
        && `59,K499974:21974,K954375:522041,K350279:202117,K264421:744050,K968414:869591,K453016:737664,K838878:868520|-81`
        && `20130130,0,-7632834418,-1954881809,-6456428670,-6999380611,-7026008684,-217034598,-5156137195,-1996285697,-734`
        && `8893823,-8588847428,-7285820057,-8578269287` TO rt_cases.
    APPEND `915584035589|K585990:0,K779289:951837,K499032:991631,K245786:921366,K046244:967766,K301167:0,K072937:104874,K6`
        && `93575:910041,K379025:138039,K868724:0,K424245:169835,K460971:600792,K276442:60934,K214041:792249|0,13185637251`
        && `7,137368968148,127635276334,134062989992,0,14528018150,126066443206,19122309603,0,23526955799,83226701375,8441`
        && `084138,109748916327` TO rt_cases.
    APPEND `818023686631|K161841:894368,K569094:0|818023686631,0` TO rt_cases.
    APPEND `139673114450|K222662:137715|139673114450` TO rt_cases.
    APPEND `-329885150005|K828611:931542,K297281:556320,K457009:759610,K628935:671622,K188313:507267|-89687535086,-5356169`
        && `6112,-73134167356,-64662808214,-48838943237` TO rt_cases.
    APPEND `234403153732|K415170:0,K466519:563570,K087668:87180,K961803:416764,K552150:811891,K250759:278893,K917930:82916`
        && `2,K518291:828236|0,34620835976,5355580461,25602353008,49875517045,17132758677,50936496973,50879611592` TO rt_cases.
    APPEND `-410975357534|K167920:0,K324945:0,K816008:914361,K338209:25229,K609149:309718,K616400:0,K987922:796151,K375545`
        && `:970482,K170017:616660|0,0,-103446494369,-2854290162,-35040034891,0,-90072772065,-109795759823,-69766006224` TO rt_cases.
    APPEND `950348746852|K199746:404106,K199078:919655,K102262:64699,K540005:0,K772870:750723,K450196:0|179527245072,40856`
        && `3912852,28743035810,0,333514553118,0` TO rt_cases.
    APPEND `-685774957239|K115847:794631,K808924:990913,K256952:332941|-257230067735,-320768530437,-107776359067` TO rt_cases.
    APPEND `-461505853445|K641734:547826,K997374:0,K458929:587235,K804467:290149,K059800:827779,K617904:994425,K693690:737`
        && `498,K013712:945994|-51273519647,0,-54961986671,-27156360691,-77475590461,-93072745316,-69025782261,-8853986839`
        && `8` TO rt_cases.
    APPEND `907151806379|K361529:0,K183645:908540,K864901:0,K999065:0,K989068:645766,K436598:692910,K681309:376959,K064759`
        && `:252695,K031928:0|0,286486251435,0,0,203626786542,218492513794,118864960106,79681294502,0` TO rt_cases.
    APPEND `358768561722|K421128:0,K204258:157061,K420649:682801,K297989:621294,K309083:0,K743910:667932,K470063:635668,K6`
        && `05829:0,K423845:544289,K159904:947449,K501341:0|0,13238254083,57551480799,52367219309,0,56298212324,5357876555`
        && `0,0,45876672607,79857957050,0` TO rt_cases.
    APPEND `389342853213|K681537:747967,K250450:771264,K204217:0,K076056:927263,K368345:0,K234512:0,K251973:939960,K059904`
        && `:423893,K028124:120927,K137518:401407|67213719609,69307231790,0,83325594960,0,0,84466571231,38091821225,108667`
        && `27371,36071187027` TO rt_cases.
    APPEND `-976164685502|K502538:139651,K005764:999041,K860931:0,K304636:234346,K213977:403404,K075514:543555,K281712:0,K`
        && `725014:0,K705189:0,K022530:790763,K922535:155400,K501216:0,K819442:860689|-33033041552,-236313115301,0,-554321`
        && `92791,-95421164862,-128572476393,0,0,0,-187047046112,-36758309337,0,-203587339154` TO rt_cases.
    APPEND `-171906904551|K400060:0,K591822:734281,K919703:0,K789604:0|0,-171906904551,0,0` TO rt_cases.
    APPEND `-365125192886|K156191:558597,K674665:887650,K616104:0,K218403:694455,K292846:0,K855023:53114,K296174:0,K100746`
        && `:813161,K259065:879744,K152987:89301|-51296958963,-81514482934,0,-63773041454,0,-4877553367,0,-74674025187,-80`
        && `788460851,-8200670130` TO rt_cases.
    APPEND `-407565992685|K021541:290084,K235327:888862,K046016:0|-100283111713,-307282880972,0` TO rt_cases.
    APPEND `-381007057240|K356683:235657|-381007057240` TO rt_cases.
    APPEND `-744856116928|K346775:344905,K345576:0,K769579:763428,K555639:592696,K006519:0,K448735:331583,K429703:180382,K`
        && `214209:0,K537817:0,K916473:166283,K454959:697325,K640585:172943|-79058637135,0,-174991888290,-135856940304,0,-`
        && `76004987104,-41346907362,0,0,-38115154488,-159839851960,-39641750285` TO rt_cases.
    APPEND `894990420720|K359406:30829,K214238:74420,K602058:88835,K861284:0,K560609:0,K066327:876762,K949460:338911,K4721`
        && `25:695064,K053558:584627,K715915:164327,K865486:894642|7360883189,17768884068,21210680142,0,0,209339993723,809`
        && `20051978,165956888411,139588408839,39235520185,213609110185` TO rt_cases.
    APPEND `924718549336|K847272:895395,K160014:0,K534644:0,K136566:0,K135221:536232,K335522:984299,K361407:107668,K780234`
        && `:0,K671583:794599,K981081:17738,K749682:802994,K684917:127805,K841222:0|194056892628,0,0,0,116216324245,213324`
        && `851442,23334637244,0,172211608090,3844315818,174031037072,27698882797,0` TO rt_cases.
    APPEND `-347221925542|K760505:0,K527475:520245,K858210:725240,K500810:917547,K679385:802328,K286046:970258,K421959:126`
        && `513|0,-44469385811,-61991902595,-78429877351,-68581213426,-82935496426,-10814049933` TO rt_cases.
    APPEND `-401929438685|K106612:333846,K439867:766406,K936824:183553,K100230:757365,K488891:0,K995169:238163,K978038:983`
        && `649,K020178:46126,K706736:977530,K196107:492509,K050943:0|-28076670458,-64455253916,-15436929280,-63694899807,`
        && `0,-20029666571,-82725534585,-3879227253,-82210922618,-41420334197,0` TO rt_cases.
    APPEND `-89532714622|K963845:293334,K097577:64390,K251901:519505,K199041:276206,K473059:0,K021608:874228,K680017:89662`
        && `6,K222446:604504,K430284:324310,K467908:75940,K740395:560764,K541560:56845|-5776335931,-1267968495,-1023009742`
        && `3,-5439051191,0,-17215306128,-17656367758,-11903898543,-6386315618,-1495411206,-11042570046,-1119392283` TO rt_cases.
    APPEND `-147191362928|K340724:701288,K733837:322332,K646281:581862,K482695:0,K922699:506718,K719455:47487,K176255:4789`
        && `32,K951414:0|-39120288501,-17980802229,-32458290043,0,-28266495860,-2648990344,-26716495951,0` TO rt_cases.
    APPEND `37746313817|K245029:557019,K496702:975890,K293126:513037,K283425:858883,K663471:0,K147434:0,K402136:939905,K22`
        && `7018:221549,K807747:10631,K347091:396803,K822420:840874,K473501:593385,K619694:716221,K882607:0|3174032109,556`
        && `0862727,2923411789,4894127885,0,0,5355811291,1262441029,60578069,2261081692,4791508146,3381254577,4081204503,0` TO rt_cases.
    APPEND `306431271705|K447707:621441,K235463:776722,K379063:622540,K015808:0|94238963331,117786686228,94405622146,0` TO rt_cases.
    APPEND `216356321180|K366105:322627,K459359:225146,K773658:691049,K180717:795696,K319311:614102,K584474:0,K465965:6471`
        && `08,K022238:722714,K424728:0|17370510968,12122051354,37206663527,42840946650,33063771867,0,34840842865,38911533`
        && `949,0` TO rt_cases.
    APPEND `-104392217783|K134206:428365,K442265:462710,K060423:658151,K594133:0,K543370:739110,K398706:502668|-1602218139`
        && `8,-17306791065,-24616891458,0,-27645009497,-18801344365` TO rt_cases.
    APPEND `-681578940262|K786753:529380,K271325:594196,K603060:0,K769143:545387,K762720:0,K906435:990485|-135672613037,-1`
        && `52284037886,0,-139774980933,0,-253847308406` TO rt_cases.
    APPEND `884942132624|K734055:0,K878234:124888,K180278:519569|0,171491120523,713451012101` TO rt_cases.
    APPEND `86679759676|K875788:94803,K979602:0,K949337:298693,K410723:0,K113764:594005,K127630:473256,K970194:0,K480447:0`
        && `,K158282:728656|3753289698,0,11825378518,0,23516901857,18736399366,0,0,28847790237` TO rt_cases.
    APPEND `256071472167|K453356:0,K616330:755986,K573586:0,K802539:698043,K618137:788086,K008380:112463,K528246:224234,K2`
        && `58136:836121|0,56688212612,0,52343310585,59095256690,8433127670,16814365169,62697199441` TO rt_cases.
    APPEND `-559809433757|K518404:0,K326021:163778,K280476:381448|0,-168158652452,-391650781305` TO rt_cases.
    APPEND `-205660057465|K517872:503962,K595043:740937,K801503:450871,K064240:274497,K560570:976584,K009120:23194,K080966`
        && `:947817,K378908:73718,K728164:0,K523761:676884|-22201060966,-32640531446,-19862240722,-12092428857,-4302149948`
        && `2,-1021766340,-41754225520,-3247502415,0,-29818801717` TO rt_cases.
    APPEND `107336724675|K454157:52844,K206742:250294,K722535:381977,K684152:243902,K029172:0|6105487713,28918456999,44132`
        && `841575,28179938388,0` TO rt_cases.
    APPEND `737700000120|K809956:0,K645664:4787,K202846:755730,K099591:249516,K438187:358348,K868993:964538,K512297:962542`
        && `,K833406:383221,K222201:304332,K483802:706604,K888329:233654,K612850:766911,K418401:0|0,620607439,97976114492,`
        && `32348336289,46457788729,125046889127,124788119032,49682432313,39454920244,91607206813,30291917822,99425667820,`
        && `0` TO rt_cases.
    APPEND `343694925476|K899492:431667,K050382:0,K491188:522525,K214447:546765,K503054:657309,K447415:532467,K974575:3710`
        && `52,K056188:386179,K457231:117488,K850978:533909,K377211:208443,K800531:652112|29912151213,0,36208111374,378878`
        && `10182,45547901974,36897037346,25711864775,26760082757,8141272837,36996960022,14443954565,45187778431` TO rt_cases.
    APPEND `557764739539|K495758:662609,K710887:0,K690664:255083,K871919:535189,K899639:173371,K177071:485425,K223357:0,K5`
        && `61917:411506,K405875:0|146473694655,0,56387627475,118306739222,38324699659,107306108471,0,90965870057,0` TO rt_cases.
    APPEND `-385083273015|K124038:92112|-385083273015` TO rt_cases.
    APPEND `-766022397077|K161182:0,K490299:392035,K436719:369381,K264006:448728,K904942:0,K380409:130896,K062578:444608|0`
        && `,-168178493431,-158460188713,-192499136557,0,-56152874300,-190731704076` TO rt_cases.
    APPEND `-854034916266|K978874:899245,K071424:633303,K931470:0,K644244:76498,K512688:949310,K118656:721436,K281643:4304`
        && `61,K746898:687561,K880457:387137,K605318:418054,K529296:0,K385761:614491,K936113:784856,K015869:635649|-106104`
        && `797205,-74725448998,0,-9026243990,-112012126879,-85124543897,-50791471857,-81127524169,-45679534360,-493275301`
        && `96,0,-72505760877,-92607672787,-75002261051` TO rt_cases.
    APPEND `233379247518|K486371:796834,K780818:712869,K276955:220186,K321610:223718,K982275:496505,K843526:673525,K607270`
        && `:232093,K774599:658222,K659472:674429,K132460:197413|38062292294,34051544293,10517603279,10686315980,237165061`
        && `17,32172203266,11086363792,31441226351,32215384546,9429807600` TO rt_cases.
    APPEND `41594167608|K033038:217172,K034575:849378,K242972:720154,K194320:106540,K507794:0,K636085:678863,K437538:92682`
        && `6,K658877:197373,K259768:0,K713763:0,K425764:879215,K240130:737850|1700067352,6649106734,5637514523,834017165,`
        && `0,5314280031,7255385703,1545076684,0,0,6882676943,5776042473` TO rt_cases.
    APPEND `-33127978111|K689086:65121,K225131:223898,K544741:0,K225859:942932,K555613:372791,K455435:0,K095803:0|-1344345`
        && `111,-4622106260,0,-19465702684,-7695824056,0,0` TO rt_cases.
  ENDMETHOD.

  METHOD kernel_cases_04.
    APPEND `980385605115|K749109:351094,K096305:0,K412624:851393,K395990:0,K889619:869226|166146326080,0,402900132159,0,41`
        && `1339146876` TO rt_cases.
    APPEND `569586308799|K320979:823090,K527235:258111|433611136976,135975171823` TO rt_cases.
    APPEND `576362806035|K954801:706620,K665845:911277,K071723:478523|194269032923,250534801612,131558971500` TO rt_cases.
    APPEND `-154159502837|K748234:601985|-154159502837` TO rt_cases.
    APPEND `389041792185|K757613:575410,K179871:310214,K829780:165696,K254267:561582,K243616:711615,K276765:715050,K071747`
        && `:268027,K053456:0,K621627:659287,K087568:151931,K213185:598513,K544388:496517|42935427971,23147270385,12363755`
        && `710,41903622653,53098650658,53354960411,19999398607,0,49194086826,11336651270,44659306931,37048660763` TO rt_cases.
    APPEND `-693467813565|K431153:141734,K389965:718043,K300600:893150|-56070770253,-284061862962,-353335180350` TO rt_cases.
    APPEND `-321329555421|K839667:0,K145351:0,K888872:729031|0,0,-321329555421` TO rt_cases.
    APPEND `-212922905600|K035076:578820,K085920:201695,K968778:799424|-78005566177,-27181736412,-107735603011` TO rt_cases.
    APPEND `916946095175|K219113:984310,K013043:549953,K602103:720942,K056823:931203,K439138:728009,K717285:323961,K421189`
        && `:150048,K369401:308417|192162950931,107365150566,140746657222,181795081221,142126319701,63245625613,2929327799`
        && `3,60211031928` TO rt_cases.
    APPEND `24271982777|K699091:0,K279495:735897,K756219:217911,K891659:0,K015173:0,K036392:601684,K901790:823717,K542480:`
        && `476281,K830097:0,K294946:515964,K397341:753921,K908524:24406,K850975:0,K183309:890964|0,3543460205,1049275859,`
        && `0,0,2897203426,3966327366,2293368188,0,2484448097,3630248609,117518742,0,4290132285` TO rt_cases.
    APPEND `-235350661339|K270770:886750,K831497:186587,K416450:95826,K045032:313793,K094604:313078,K640443:378376,K816488`
        && `:491315,K471622:160615,K134181:223971|-68418334702,-14396359534,-7393578056,-24211101777,-24155935034,-2919408`
        && `6057,-37908039599,-12392456530,-17280770050` TO rt_cases.
    APPEND `266796061791|K919338:716564,K083944:778244,K844314:163929,K400042:5358,K626988:724761,K549329:14874|7953324758`
        && `7,86379266520,18194893608,594697948,80443053313,1650902815` TO rt_cases.
    APPEND `643265614982|K034950:808656,K255626:163822,K332186:221759,K026905:0,K836376:354026,K667071:0|335976897432,6806`
        && `4056028,92135470209,0,147089191313,0` TO rt_cases.
    APPEND `415066935035|K367674:598556,K272648:0,K253084:253817,K219803:728732,K969494:644590,K850727:546492,K944378:0|89`
        && `619064070,0,38002863533,109109723732,96511525252,81823758448,0` TO rt_cases.
    APPEND `-665491636307|K389908:968276,K284943:772964,K325436:17161,K489246:736444,K805141:506794,K592184:604184,K151310`
        && `:167420|-170776061769,-136328637505,-3026707257,-129887558954,-89383898236,-106560695611,-29528076975` TO rt_cases.
    APPEND `842332806686|K578312:383728,K578297:210275,K626990:488938,K944844:647412,K845346:907921,K550790:771244,K143366`
        && `:537873|81883624714,44870531175,104334361059,138151089427,193741041660,164575569828,114776588823` TO rt_cases.
    APPEND `-504434185646|K973197:418656,K172353:226080,K578330:396609,K279236:249604,K638591:5865,K040480:261749,K455782:`
        && `227541,K239619:356639,K553789:0|-98557969120,-53222659316,-93367771093,-58760565534,-1380709912,-61619682649,-`
        && `53566600864,-83958227158,0` TO rt_cases.
    APPEND `-617224145812|K784996:787338,K661189:403966,K207960:976826,K412129:711511,K470882:19881,K426785:957521,K226894`
        && `:626961,K695282:0,K741825:345790,K850597:0,K761731:675511,K134839:954388,K637919:0,K845996:748120|-67421841343`
        && `,-34592680094,-83648201397,-60928574203,-1702462764,-81995063041,-53688333435,0,-29610914903,0,-57845798713,-8`
        && `1726775941,0,-64063499978` TO rt_cases.
    APPEND `394773616393|K015373:0,K017737:0,K409028:213928,K026570:161867,K999051:219925,K260766:0,K977568:516201,K367361`
        && `:397220,K543857:778309,K677852:410574,K012234:514829|0,0,26286023733,19889120655,27022894476,0,63427282716,488`
        && `07703279,95633338532,50448552354,63258700648` TO rt_cases.
    APPEND `-54454140931|K585488:329222,K610482:388173,K510865:532466,K599697:63704,K835931:0,K642543:748834,K111811:79455`
        && `2,K105110:0,K453855:509516|-5325316180,-6278875524,-8612880686,-1030441289,0,-12112731885,-12852241410,0,-8241`
        && `653957` TO rt_cases.
    APPEND `234968455738|K693324:116388,K597901:0,K920707:299714,K934341:561396|27977048164,0,72044480647,134946926927` TO rt_cases.
    APPEND `225932517487|K648458:950238,K827677:0,K333468:701541,K887267:0,K456308:0,K008937:303889,K871756:462825,K831693`
        && `:545223,K531885:938771,K348075:0,K250535:0|55013549962,0,40615362524,0,0,17593500454,26795020049,31565410720,5`
        && `4349673778,0,0` TO rt_cases.
    APPEND `819537545950|K024263:284562,K747222:532164,K930213:282067,K893868:439133,K666606:369667,K743684:751154,K295757`
        && `:0,K741672:505164,K830607:0,K862965:234482,K350429:619148|58047756862,108556049236,57538802211,89578670427,754`
        && `08312199,153227784306,0,103048323555,0,47831945672,126299901482` TO rt_cases.
    APPEND `-349687161328|K246559:132165,K049121:516819,K027649:116961,K893049:271861|-44532796763,-174141380017,-39409831`
        && `969,-91603152579` TO rt_cases.
    APPEND `714980495238|K036089:715378,K531709:326219,K659293:314915,K504934:681874,K753387:0,K839692:0,K187090:888103,K6`
        && `26760:557261,K000483:131817,K143298:663706,K942443:133471,K266992:0,K690174:730122,K790977:23400|99004061487,4`
        && `5146769868,43582363482,94367307105,0,0,122908174446,77121608868,18242689002,91852963934,18471592767,0,10104454`
        && `3418,3238420861` TO rt_cases.
    APPEND `-660181713866|K091969:808881,K066883:0,K392044:69686,K436850:0,K397255:178665,K082770:0|-505100531287,0,-43514`
        && `973925,0,-111566208654,0` TO rt_cases.
    APPEND `205749409274|K133519:224887,K720849:0,K969378:662199,K193881:558334,K147882:0,K107531:618502,K753268:836723|15`
        && `951751215,0,46971295375,39603912467,0,43871766843,59350683374` TO rt_cases.
    APPEND `-118458980927|K822502:520386,K061381:484287,K021487:0,K633729:463236,K507890:14750,K967978:835283,K257753:6008`
        && `83,K375644:782225,K856404:314044|-15353163649,-14288119904,0,-13667043533,-435175358,-24643700239,-17728099974`
        && `,-23078308093,-9265370177` TO rt_cases.
    APPEND `-706387760230|K605038:677541,K606222:0,K364641:0,K330237:93566,K828634:0,K904155:212418,K820732:92475,K240465:`
        && `500191,K584421:0,K204059:741694,K860084:316989,K055390:418988|-156721773759,0,0,-21642719014,0,-49134333920,-2`
        && `1390360182,-115699006758,0,-171560981942,-73322615668,-96915968987` TO rt_cases.
    APPEND `818814459814|K594650:586802,K860102:87883,K253836:0|712157470001,106656989813,0` TO rt_cases.
    APPEND `495419050121|K445617:980396,K557829:437805,K644568:42248,K727903:146879,K989181:30263,K586800:0,K156896:0,K669`
        && `643:373812,K754269:193492,K271028:0,K847279:336956,K152181:525020|158372117726,70722549869,6824696581,23726676`
        && `036,4888652543,0,0,60385189323,31256490034,0,54431510635,84811167374` TO rt_cases.
    APPEND `176359496152|K695142:400268,K548246:635733,K222852:242543,K098673:0|55212071549,87691586341,33455838262,0` TO rt_cases.
    APPEND `-997144582739|K143068:161244,K222066:640398,K366861:627183,K179425:778887,K038787:303766,K359582:371042,K48147`
        && `3:413439,K110397:474969,K121670:248880|-39997826040,-158855695719,-155577612373,-193208967348,-75351514630,-92`
        && `039848736,-102556753741,-117819747938,-61736616214` TO rt_cases.
    APPEND `-146092003364|K477623:852648,K155142:647466|-83037058840,-63054944524` TO rt_cases.
    APPEND `-485515062949|K511006:261518,K503518:595417,K991129:357059,K240262:481092,K379592:788601|-51121952256,-1163930`
        && `56869,-69798458043,-94044625053,-154156970728` TO rt_cases.
    APPEND `-283382619741|K726198:967891,K694387:197256,K304563:898460,K616770:884324,K218613:288813,K143872:299803,K71269`
        && `6:739689,K800941:862743,K676576:0|-53373148091,-10877437335,-49544461756,-48764949579,-15926234483,-1653226439`
        && `5,-40789231988,-47574892114,0` TO rt_cases.
    APPEND `-811191526826|K421107:261049,K092607:169079,K295311:425096,K938191:0,K795169:32909,K635075:767028,K092044:7076`
        && `89,K729193:494383,K722334:152276|-70363882243,-45574029572,-114581572372,0,-8870384490,-206746886100,-19075248`
        && `5016,-133257385377,-41044901656` TO rt_cases.
    APPEND `-976459345988|K941318:113095,K557455:0,K492317:0,K938214:710698,K983954:750186,K223553:514238,K088142:83924,K8`
        && `87719:974592,K376530:810122|-27909203075,0,0,-175383658050,-185128373653,-126901921138,-20710481974,-240506530`
        && `294,-199919177804` TO rt_cases.
    APPEND `-412434950393|K676125:0,K459061:584014,K454422:373600,K044349:359212,K475563:128358|0,-166669285793,-106620124`
        && `127,-102513993651,-36631546822` TO rt_cases.
    APPEND `-470527433800|K235468:413551,K466564:670206,K125382:0,K152997:782083,K134194:475713|-83101723845,-134675708514`
        && `,0,-157157026558,-95592974883` TO rt_cases.
    APPEND `379063078641|K297232:956252,K438481:0,K597796:122809,K024395:157697,K512219:447021,K324401:317090,K403712:0|18`
        && `1161198997,0,23266069705,29875574219,84687781398,60072454322,0` TO rt_cases.
    APPEND `393685212963|K585621:0,K596152:252450,K705154:0,K373129:895707,K907708:694983,K826167:864913,K283698:196491,K5`
        && `34657:443533,K593188:363704,K660272:767283|0,22188973413,0,78727743352,61085202257,76021119278,17270483561,389`
        && `84123371,31967591152,67439976579` TO rt_cases.
    APPEND `-798820720077|K882943:112297,K284026:0,K508516:712740,K320230:239023,K785224:801027|-48097043410,0,-3052680545`
        && `35,-102374058140,-343081563992` TO rt_cases.
    APPEND `376670275492|K105478:178649,K058630:708382,K203413:697096,K492801:0,K954808:396187,K293428:816982,K980640:4132`
        && `7,K754864:0,K182549:856006,K801968:363201,K801702:937452,K736294:0|13471064906,53415691665,52564668494,0,29874`
        && `562925,61604697195,3116271008,0,64547310010,27387246752,70688762537,0` TO rt_cases.
    APPEND `719340653516|K761391:0,K936268:0,K405950:287644,K804465:167426,K095392:832864,K273746:540898|0,0,113139983847,`
        && `65854232787,327593203777,212753233105` TO rt_cases.
    APPEND `989407099415|K975811:849721,K037366:125687,K980174:275165|672267824367,99438905289,217700369759` TO rt_cases.
    APPEND `-242886561948|K462290:557990,K161358:811420,K132467:627948,K331945:975117,K397868:356168,K869748:581018,K82019`
        && `5:808018,K657727:670026,K728968:968741,K404272:996157,K785786:830858,K358351:851242,K950884:18594,K041278:9130`
        && `83|-13598545580,-19774784234,-15303463324,-23764176725,-8680024341,-14159751530,-19691875487,-16328929015,-236`
        && `08789842,-24276933941,-20248499765,-20745269874,-453146753,-22252371537` TO rt_cases.
    APPEND `-11059487190|K667282:0,K123691:0,K722888:0,K028167:949270,K852827:412606,K759704:178117,K625604:0,K955326:0,K5`
        && `07946:62217,K794039:526223,K789040:781460,K395994:649076,K659916:612130|0,0,0,-2516948028,-1094006824,-4722694`
        && `62,0,0,-164965664,-1395257348,-2072007128,-1720996722,-1623036014` TO rt_cases.
    APPEND `-915725320882|K477191:0,K208387:266578,K369800:613326,K690770:630781|0,-161590420631,-371777139612,-3823577606`
        && `39` TO rt_cases.
    APPEND `-877476968118|K085017:667778,K276680:294911,K338622:72815|-565869194919,-249904983607,-61702789592` TO rt_cases.
    APPEND `625293170429|K784772:301652,K349487:846219,K918222:881806|92931503607,260699097141,271662569681` TO rt_cases.
    APPEND `-494280539212|K467261:433279,K898733:235992,K585309:595353,K300983:653601,K314250:0,K666979:0,K278552:756173,K`
        && `092526:992704,K897005:584027,K587571:380453,K196965:503156,K642176:608874,K785143:597809|-33771827757,-1839433`
        && `9851,-46404646823,-50944773216,0,0,-58939723159,-77376075236,-45521844469,-29654317855,-39218373766,-474585379`
        && `26,-46596079154` TO rt_cases.
    APPEND `-793724177635|K065932:74906,K876050:677170,K720317:862359,K513091:564123,K104496:872788,K507266:482783,K035742`
        && `:124623,K458306:528159,K794250:327562|-13169799277,-119058459618,-151617960303,-99182798138,-153451562907,-848`
        && `81787897,-21910926965,-92859691028,-57591191502` TO rt_cases.
    APPEND `-602115474292|K090019:0,K289652:687676,K795217:187607,K900866:0,K270683:798619|0,-247362367032,-67483686491,0,`
        && `-287269420769` TO rt_cases.
    APPEND `649316177903|K255244:918172,K609997:775262,K869057:972577|223623958677,188817735078,236874484148` TO rt_cases.
    APPEND `-425642840136|K316136:325078,K894820:349352,K669102:427148,K714578:100040,K813605:667469,K151342:113338,K60530`
        && `4:592182,K052871:263905,K138907:0|-48746358369,-52386312789,-64052041308,-15001278743,-100088849673,-169953511`
        && `61,-88799352745,-39573295348,0` TO rt_cases.
    APPEND `940689183208|K389019:890226,K013947:284249,K064178:378029,K283633:946206,K966053:378894,K484752:0,K723751:3997`
        && `7,K511136:74389,K160906:707230,K008062:836750,K882598:0,K771624:613578,K138569:0|162621888610,51925139476,6905`
        && `6385602,172848025933,69214399336,0,7302791921,13588998380,129193124310,152853169077,0,112085260563,0` TO rt_cases.
    APPEND `647310731355|K250628:523721,K414151:0,K094129:0,K621220:0,K576103:0,K846737:0,K249846:186571,K904758:0,K425251`
        && `:0|477282897085,0,0,0,0,0,170027834270,0,0` TO rt_cases.
    APPEND `176199210272|K800572:186986,K484365:880037,K971369:414420,K801795:8419,K002936:794368,K735913:628070,K286476:5`
        && `6269,K540708:136333|10611215920,49940972182,23517804015,477767463,45079366197,35642167771,3193193654,773672307`
        && `0` TO rt_cases.
    APPEND `456542401082|K699004:561764,K695903:0,K096543:441230,K819782:211727,K884164:385273,K755711:549468,K439855:7517`
        && `99,K352433:790871,K891603:273871,K917555:27202,K011695:259068,K638175:377712,K370817:296879,K574230:0|52055239`
        && `479,0,40886089738,19619448183,35700896248,50915844245,69664622484,73285186132,25377953182,2520643232,240062495`
        && `66,35000264549,27509964044,0` TO rt_cases.
    APPEND `-246662075670|K550530:230102,K269306:103236,K866749:0,K090466:58792,K609605:671341,K299347:0,K547453:462933|-3`
        && `7183757993,-16682612234,0,-9500601907,-108486589751,0,-74808513785` TO rt_cases.
    APPEND `-431592543291|K598889:625285,K846400:610338,K792380:0,K908641:386904,K502798:313675,K922824:849422,K398835:791`
        && `954,K071250:671112|-63518012242,-61999658645,0,-39302674794,-31863890050,-86286408589,-80448665595,-6817323337`
        && `6` TO rt_cases.
    APPEND `-142834065357|K366082:478691,K431220:526595,K177936:0,K585616:6298,K170439:80589,K562820:140681|-55459431190,-`
        && `61009417698,0,-729663807,-9336753981,-16298798681` TO rt_cases.
    APPEND `-130735595676|K657738:546107,K189597:362830,K678506:486908,K355722:823885,K716696:424798,K503220:689825,K68471`
        && `5:880947|-16937258071,-11253005997,-15101228245,-25552415307,-13174915088,-21394605909,-27322167059` TO rt_cases.
    APPEND `875037388893|K525829:0,K146896:487257,K990780:882023,K580553:0,K593441:0,K487388:0|0,311381231742,563656157151`
        && `,0,0,0` TO rt_cases.
    APPEND `-374015570709|K289592:940052,K542566:494847,K324761:351132,K478107:617257,K274140:0|-146297108493,-77011362400`
        && `,-54645483760,-96061616056,0` TO rt_cases.
    APPEND `-774678757410|K378137:126064,K879038:365329,K760121:0,K411519:95574,K698309:494534,K630115:112612,K058101:6310`
        && `62,K346698:0|-53506706411,-155060537081,0,-40565506081,-209900412079,-47797128620,-267848467138,0` TO rt_cases.
    APPEND `528284711203|K131461:197839,K944682:792469,K678768:0,K665778:912784,K847962:355133,K185397:0,K243986:855644,K9`
        && `06129:252155,K547466:190547,K397722:636666,K020733:292327,K979599:32544,K142113:865332|19414225659,77766122926`
        && `,0,89572806947,34849712144,0,83965576552,24744332871,18698651209,62476950415,28686469018,3193589534,8491627392`
        && `8` TO rt_cases.
    APPEND `343041956271|K654318:97849,K456945:329685,K711177:0,K058903:697054,K973805:445430,K052105:532823,K380759:32475`
        && `0,K438599:927541,K676736:627626,K818624:824664,K840516:248759,K020489:904658,K825319:0,K509614:517709|51811474`
        && `39,17456965257,0,36909314832,23585713740,28213211397,17195654844,49113702509,33233071800,43666320266,131718980`
        && `86,47902037629,0,27412918472` TO rt_cases.
    APPEND `-653455826292|K535180:962051,K663390:452100,K198567:8959,K578865:696276,K375977:462726,K849666:192953,K375284:`
        && `692843|-181278693420,-85188932078,-1688139001,-131198869436,-87191182891,-36358018163,-130551991303` TO rt_cases.
    APPEND `-805665603164|K901037:768806,K172712:721418,K978642:0,K305071:502030,K016282:815854,K026672:0,K498024:201283,K`
        && `652284:0,K554577:28551,K524372:889814|-157698326909,-147978048561,0,-102976942243,-167348864085,0,-41287388932`
        && `,0,-5856412322,-182519620112` TO rt_cases.
    APPEND `-306523992776|K716323:121639,K891311:989267,K434066:0,K608282:667518,K903537:636417,K823056:316519,K050559:0|-`
        && `13650808373,-111019444805,0,-74911502918,-71421226023,-35521010657,0` TO rt_cases.
    APPEND `804521098917|K276131:571293,K842065:0,K956920:925940,K353868:0,K477422:371554,K985733:72477,K666016:814103,K84`
        && `5449:917560,K447399:280456,K900667:196582,K987609:285893|103614063427,0,167935553016,0,67387872287,13144982478`
        && `,147651940209,166415692189,50865642975,35653613499,51851738837` TO rt_cases.
    APPEND `-548037089947|K784629:224155,K442110:0,K690128:627549,K613285:653148,K791196:0,K200412:223500,K348929:918760,K`
        && `958878:397597,K246667:592466,K284767:499632,K735491:110604,K740473:314643,K857177:512478|-24208193760,0,-67773`
        && `762735,-70538392353,0,-24137455356,-99223841087,-42939507102,-63984884228,-53959038454,-11944962471,-339806772`
        && `51,-55346375150` TO rt_cases.
    APPEND `672650743425|K015843:916952,K684407:653576,K250541:547259,K781260:615796,K843620:861492,K008695:309097,K091254`
        && `:0,K009348:0,K450771:799618,K319649:592268,K006058:984970,K876626:122041|96327002643,68659010591,57490271180,6`
        && `4690172353,90500857363,32471042689,0,0,84000913024,62218525290,103472382189,12820566103` TO rt_cases.
    APPEND `-163547312971|K281130:358606,K129835:219476,K904086:0,K579033:752765|-44068963386,-26971327329,0,-92507022256` TO rt_cases.
    APPEND `-468480221474|K988230:929314,K123860:779896,K261753:80532,K428548:216526,K845651:0,K916478:741813,K427115:3093`
        && `42,K695550:985901|-107675078361,-90362743823,-9330849864,-25087811027,0,-85950252449,-35841948029,-11423153792`
        && `1` TO rt_cases.
    APPEND `-470642586915|K624855:654285,K113892:625364,K680792:943288,K173608:479856,K762561:0,K237434:164391,K061323:0,K`
        && `722716:198323,K332743:0,K448973:543808,K583594:777166,K435899:406464,K808802:0|-64247427204,-61407533515,-9262`
        && `6037755,-47119395108,0,-16142352042,0,-19474300198,0,-53399153110,-76313710402,-39912677581,0` TO rt_cases.
    APPEND `377182765032|K863244:987811,K183017:848377,K993191:997727,K208940:421778,K631088:163887,K493797:0,K909668:7860`
        && `81|88591373463,76086299549,89480685345,37826965195,14698129928,0,70499311552` TO rt_cases.
    APPEND `589397580861|K297764:866470,K154070:135613,K108118:910464,K062207:419758,K331362:0,K206947:511185,K219959:9619`
        && `07,K003600:960849,K525224:796040,K361008:890277,K822494:765829,K246126:573523|65541695705,10258065460,68869498`
        && `584,31751417944,0,38667157223,72760760200,72680730754,60214215667,67342509524,57928989209,43382540591` TO rt_cases.
    APPEND `-840974482155|K117569:98774,K149919:446400,K537951:266813,K801768:0,K935132:7743,K213985:162474,K039287:388849`
        && `,K098916:848556,K273625:114240|-35592025663,-160854883428,-96142862930,0,-2790097138,-58545556295,-14011707116`
        && `1,-305766972362,-41165013178` TO rt_cases.
    APPEND `-496977529184|K321933:386551,K018626:621169,K153160:403694,K768095:7764,K707853:774250,K991656:226177|-7939608`
        && `3610,-127585715365,-82917189651,-1594695637,-159027961990,-46455882931` TO rt_cases.
    APPEND `-362957011803|K835264:811774,K016834:734931,K473708:444702,K343603:0,K588991:0,K957322:80595,K488486:200229,K5`
        && `23032:543871,K283512:224113,K650913:532059,K937083:366234,K692060:992942,K788826:0,K089426:295991|-56363919803`
        && `,-51028478302,-30877002545,0,0,-5595954190,-13902504020,-37762605636,-15560842253,-36942462812,-25428732387,-6`
        && `8942961042,0,-20551548813` TO rt_cases.
    APPEND `-418331732010|K283523:344454,K664992:988284,K185642:501112,K961018:22631,K053581:0,K154741:233419|-68948771912`
        && `,-197823129067,-100306737591,-4530008817,0,-46723084623` TO rt_cases.
    APPEND `-507821311984|K386889:165501,K247947:778778,K348481:299619,K556743:568031,K566203:0,K585883:278058,K691958:893`
        && `032,K475530:603046,K158359:385424,K936196:554389,K356768:807398,K110331:0|-15758594709,-74153309468,-285289780`
        && `01,-54086502867,0,-26475993061,-85032291950,-57420544316,-36699117269,-52787545465,-76878434878,0` TO rt_cases.
    APPEND `-264669234868|K902079:0,K583081:959714,K198409:827928,K295426:0,K194974:0,K927251:0,K478029:0,K242935:171654,K`
        && `674836:393567,K520568:307790,K756988:946769,K256274:33651|0,-69761515375,-60182004120,0,0,0,0,-12477512217,-28`
        && `608346155,-22373224541,-68820544611,-2446087849` TO rt_cases.
    APPEND `-880821177520|K881444:611160|-880821177520` TO rt_cases.
    APPEND `157428327520|K608723:621437,K103043:0,K122023:228918,K096806:0,K863164:734814,K681998:344982,K586729:691722,K3`
        && `55330:682973,K727447:436295|26150254045,0,9632937620,0,30921191973,14516945307,29107867778,28739707253,1835942`
        && `3544` TO rt_cases.
    APPEND `772889341431|K514703:0,K113494:48730,K209170:272113,K733210:456414,K717182:975064,K247988:927025,K432765:37972`
        && `6,K774141:122222,K910742:992383,K490198:381617,K439058:907899|0,6893935032,38496395307,64569843291,13794434368`
        && `6,131148165869,53720631518,17291002000,140394498843,53988155243,128442370642` TO rt_cases.
    APPEND `-748293579551|K841963:588188,K857723:976546,K130174:277758,K046869:502649,K115812:698572,K845886:245849,K47107`
        && `9:361070,K071574:0,K435980:0,K763471:0,K490937:29798,K829633:462808|-106230273030,-176370052103,-50164757146,-`
        && `90781417690,-126166284065,-44401800775,-65211402958,0,0,0,-5381697137,-83585894647` TO rt_cases.
    APPEND `-613208420736|K762585:0,K411015:986323,K728952:147178,K604058:0,K743509:581876,K451190:450943,K444921:793146,K`
        && `390156:780945,K357464:942459,K609511:0,K208866:339101,K087256:711549,K401489:60910,K527489:819558|0,-914458219`
        && `71,-13645441895,0,-53947975567,-41808670483,-73535634790,-72404432868,-87379020796,0,-31439365883,-65970461175`
        && `,-5647201795,-75984393513` TO rt_cases.
    APPEND `-523108391071|K620093:809492,K023103:502848,K121991:372114|-251388317938,-156159805037,-115560268096` TO rt_cases.
    APPEND `-109348814542|K436427:727730,K277982:872035,K222483:0,K554644:516847,K181273:718515,K085588:425129,K838289:989`
        && `563,K941159:0,K572664:473072,K664661:561989,K523062:660879,K401565:675137|-12018979426,-14402279312,0,-8536096`
        && `436,-11866787136,-7021308321,-16343337966,0,-7813121123,-9281648728,-10914887533,-11150368561` TO rt_cases.
    APPEND `169466833328|K252873:828544,K619649:121182,K079404:0,K259154:609898,K180186:495693,K601240:460469|55811872692,`
        && `8162987550,0,41083574960,33390567804,31017830322` TO rt_cases.
    APPEND `164684483902|K223782:145331,K005497:820436,K360242:13881,K116654:685212,K315613:557399,K725699:892084,K107637:`
        && `499215,K782312:309811,K742987:0|6100308365,34438024880,582658761,28761960597,23396975060,37445469222,209546857`
        && `89,13004401228,0` TO rt_cases.
    APPEND `957576007118|K297429:717247,K414281:915774,K739024:213873,K843268:884581,K338963:0,K612254:230320,K908468:0,K1`
        && `56066:155566|220320494924,281303067031,65696482817,271721350832,0,70748593429,0,47786018085` TO rt_cases.
    APPEND `754262627445|K497760:420403,K389424:178554,K327072:541593,K851352:720494,K322384:233862,K401033:445414,K880917`
        && `:482657,K239338:747524,K630319:207832,K743712:516756,K561831:0,K899264:535088,K606959:165428|61031250714,25921`
        && `256366,78624791374,104596422842,33950495963,64662177733,70068863390,108520454561,30171637449,75019124492,0,776`
        && `80439678,24015712883` TO rt_cases.
    APPEND `876292248145|K895952:56025,K417933:824536,K305465:461725,K559530:996453|20991770866,308941914902,173001792109,`
        && `373356770268` TO rt_cases.
    APPEND `812899433644|K021703:0,K715057:0,K080450:919199,K827064:849051,K512462:213113,K949903:0,K317820:661430,K200141`
        && `:688098,K446532:942019,K162261:224264|0,0,166152420722,153472620147,38521844385,0,119558654478,124379104409,17`
        && `0277314505,40537474998` TO rt_cases.
    APPEND `231445337446|K076108:364698,K858728:433599,K528443:974809|47604402487,56598120401,127242814558` TO rt_cases.
  ENDMETHOD.

ENDCLASS.

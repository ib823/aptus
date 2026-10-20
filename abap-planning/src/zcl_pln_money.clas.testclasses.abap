CLASS ltc_money DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    TYPES ty_decimal TYPE zcl_pln_money=>ty_decimal.
    TYPES ty_minor TYPE zcl_pln_money=>ty_minor.

    METHODS negative_tie_away_from_zero FOR TESTING RAISING cx_static_check.
    METHODS yen_and_dinar_internal_format FOR TESTING RAISING cx_static_check.
    METHODS too_many_decimals_rejected FOR TESTING.
    METHODS shift_forgotten_is_100x_off FOR TESTING RAISING cx_static_check.
    METHODS parent_is_sum_of_leaves FOR TESTING RAISING cx_static_check.
    METHODS invalid_rate_rejected FOR TESTING.
    METHODS overflow_rejected FOR TESTING.
    METHODS differential_round FOR TESTING RAISING cx_static_check.
    METHODS differential_minor FOR TESTING RAISING cx_static_check.
    METHODS differential_convert FOR TESTING RAISING cx_static_check.
    METHODS round_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS round_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS round_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS round_cases_04 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS round_cases_05 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS round_cases_06 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS minor_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS minor_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS minor_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS convert_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS convert_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS convert_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS convert_cases_04 RETURNING VALUE(rt_cases) TYPE string_table.
ENDCLASS.


CLASS ltc_money IMPLEMENTATION.

  METHOD negative_tie_away_from_zero.
    " A browser's Math.round(-100.5) gives -100; ABAP, Excel ROUND and this engine give -101.
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pln_money=>round_commercial( iv_value = CONV #( '-1.005' ) iv_decimals = 2 )
      exp = CONV ty_decimal( '-1.01' ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pln_money=>round_commercial( iv_value = CONV #( '2.675' ) iv_decimals = 2 )
      exp = CONV ty_decimal( '2.68' ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pln_money=>round_commercial( iv_value = CONV #( '-100.5' ) iv_decimals = 0 )
      exp = CONV ty_decimal( '-101' ) ).
  ENDMETHOD.

  METHOD yen_and_dinar_internal_format.
    DATA(lv_jpy) = zcl_pln_money=>to_minor( iv_amount = 1250000 iv_currency_decimals = 0 ).
    cl_abap_unit_assert=>assert_equals( act = zcl_pln_money=>to_internal( lv_jpy )
                                        exp = CONV zcl_pln_money=>ty_internal( '12500.00' ) ).
    DATA(lv_kwd) = zcl_pln_money=>to_minor( iv_amount = CONV #( '1234.567' ) iv_currency_decimals = 3 ).
    cl_abap_unit_assert=>assert_equals( act = lv_kwd exp = CONV ty_minor( 1234567 ) ).
    cl_abap_unit_assert=>assert_equals( act = zcl_pln_money=>to_internal( lv_kwd )
                                        exp = CONV zcl_pln_money=>ty_internal( '12345.67' ) ).
    cl_abap_unit_assert=>assert_equals(
      act = zcl_pln_money=>from_minor( iv_minor = zcl_pln_money=>from_internal( CONV #( '12345.67' ) )
                                       iv_currency_decimals = 3 )
      exp = CONV ty_decimal( '1234.567' ) ).
  ENDMETHOD.

  METHOD too_many_decimals_rejected.
    TRY.
        zcl_pln_money=>to_minor( iv_amount = CONV #( '1234.5' ) iv_currency_decimals = 0 ).
        cl_abap_unit_assert=>fail( `fractional yen accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-invalid_decimals ).
    ENDTRY.
  ENDMETHOD.

  METHOD shift_forgotten_is_100x_off.
    " JPY 1,250,000 is stored as 12,500.00. Reading the stored value as yen is 100 times too small.
    DATA(ls_rate) = VALUE zcl_pln_money=>ty_rate( rate = CONV #( '0.03021' ) from_factor = 1 to_factor = 1 ).
    DATA(lv_right) = zcl_pln_money=>convert( iv_minor = 1250000 iv_source_decimals = 0 iv_target_decimals = 2
                                             is_rate = ls_rate ).
    DATA(lv_wrong) = zcl_pln_money=>convert( iv_minor = 12500 iv_source_decimals = 0 iv_target_decimals = 2
                                             is_rate = ls_rate ).
    cl_abap_unit_assert=>assert_equals( act = lv_right exp = CONV ty_minor( 3776250 ) ).
    cl_abap_unit_assert=>assert_equals( act = lv_wrong exp = CONV ty_minor( 37763 ) ).
  ENDMETHOD.

  METHOD parent_is_sum_of_leaves.
    " 3 x 7 cents at 0.21385: each leaf converts to 1 cent, so the parent is 3 cents. Converting
    " the 21-cent parent directly would give 4 cents and disagree with its own leaves.
    DATA(ls_rate) = VALUE zcl_pln_money=>ty_rate( rate = CONV #( '0.21385' ) from_factor = 1 to_factor = 1 ).
    DATA(lv_parent) = zcl_pln_money=>convert_and_sum( it_leaves = VALUE #( ( CONV #( 7 ) ) ( CONV #( 7 ) ) ( CONV #( 7 ) ) )
                                                      iv_source_decimals = 2 iv_target_decimals = 2
                                                      is_rate = ls_rate ).
    DATA(lv_direct) = zcl_pln_money=>convert( iv_minor = 21 iv_source_decimals = 2 iv_target_decimals = 2
                                              is_rate = ls_rate ).
    cl_abap_unit_assert=>assert_equals( act = lv_parent exp = CONV ty_minor( 3 ) ).
    cl_abap_unit_assert=>assert_equals( act = lv_direct exp = CONV ty_minor( 4 ) ).
  ENDMETHOD.

  METHOD invalid_rate_rejected.
    TRY.
        zcl_pln_money=>convert( iv_minor = 1 iv_source_decimals = 2 iv_target_decimals = 2
                                is_rate = VALUE #( rate = 0 from_factor = 1 to_factor = 1 ) ).
        cl_abap_unit_assert=>fail( `zero rate accepted` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-invalid_rate ).
    ENDTRY.
  ENDMETHOD.

  METHOD overflow_rejected.
    TRY.
        zcl_pln_money=>convert( iv_minor = CONV #( '100000000000000000000' ) iv_source_decimals = 0
                                iv_target_decimals = 6
                                is_rate = VALUE #( rate = 9999 from_factor = 1 to_factor = 1000 ) ).
        cl_abap_unit_assert=>fail( `overflow not detected` ).
      CATCH zcx_pln_error INTO DATA(lx).
        cl_abap_unit_assert=>assert_equals( act = lx->reason exp = zcx_pln_error=>reasons-overflow ).
    ENDTRY.
  ENDMETHOD.

  METHOD differential_round.
    DATA lt_cases TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF round_cases_01( ) TO lt_cases.
    APPEND LINES OF round_cases_02( ) TO lt_cases.
    APPEND LINES OF round_cases_03( ) TO lt_cases.
    APPEND LINES OF round_cases_04( ) TO lt_cases.
    APPEND LINES OF round_cases_05( ) TO lt_cases.
    APPEND LINES OF round_cases_06( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_value) DATA(lv_dec) DATA(lv_exp).
      DATA(lv_got) = zcl_pln_money=>round_commercial( iv_value = CONV #( lv_value ) iv_decimals = CONV #( lv_dec ) ).
      IF lv_got <> CONV ty_decimal( lv_exp ).
        lv_failed = lv_failed + 1.
        IF lv_first IS INITIAL.
          lv_first = |{ lv_case } got { lv_got }|.
        ENDIF.
      ENDIF.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
  ENDMETHOD.

  METHOD differential_minor.
    DATA lt_cases TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF minor_cases_01( ) TO lt_cases.
    APPEND LINES OF minor_cases_02( ) TO lt_cases.
    APPEND LINES OF minor_cases_03( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_amount) DATA(lv_dec) DATA(lv_minor) DATA(lv_internal).
      DATA(lv_got) = zcl_pln_money=>to_minor( iv_amount = CONV #( lv_amount ) iv_currency_decimals = CONV #( lv_dec ) ).
      DATA(lv_int) = zcl_pln_money=>to_internal( lv_got ).
      DATA(lv_back) = zcl_pln_money=>from_minor( iv_minor = zcl_pln_money=>from_internal( lv_int )
                                                 iv_currency_decimals = CONV #( lv_dec ) ).
      IF lv_got <> CONV ty_minor( lv_minor ) OR lv_int <> CONV zcl_pln_money=>ty_internal( lv_internal )
         OR lv_back <> CONV ty_decimal( lv_amount ).
        lv_failed = lv_failed + 1.
        IF lv_first IS INITIAL.
          lv_first = |{ lv_case } got { lv_got } / { lv_int } / { lv_back }|.
        ENDIF.
      ENDIF.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
  ENDMETHOD.

  METHOD differential_convert.
    DATA lt_cases TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF convert_cases_01( ) TO lt_cases.
    APPEND LINES OF convert_cases_02( ) TO lt_cases.
    APPEND LINES OF convert_cases_03( ) TO lt_cases.
    APPEND LINES OF convert_cases_04( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_minor) DATA(lv_ds) DATA(lv_dt) DATA(lv_rate) DATA(lv_ff) DATA(lv_tf) DATA(lv_exp).
      DATA(lv_got) = zcl_pln_money=>convert(
        iv_minor           = CONV #( lv_minor )
        iv_source_decimals = CONV #( lv_ds )
        iv_target_decimals = CONV #( lv_dt )
        is_rate            = VALUE #( rate = CONV #( lv_rate ) from_factor = CONV #( lv_ff ) to_factor = CONV #( lv_tf ) ) ).
      IF lv_got <> CONV ty_minor( lv_exp ).
        lv_failed = lv_failed + 1.
        IF lv_first IS INITIAL.
          lv_first = |{ lv_case } got { lv_got }|.
        ENDIF.
      ENDIF.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
  ENDMETHOD.

  METHOD round_cases_01.
    APPEND `-9743543.22736|3|-9743543.227` TO rt_cases.
    APPEND `381059.7295|3|381059.73` TO rt_cases.
    APPEND `-12881854.05|1|-12881854.1` TO rt_cases.
    APPEND `-883957.992158|0|-883958` TO rt_cases.
    APPEND `-122622572.5|0|-122622573` TO rt_cases.
    APPEND `616861232.5|0|616861233` TO rt_cases.
    APPEND `-664387968.014|2|-664387968.01` TO rt_cases.
    APPEND `-892446209.5|0|-892446210` TO rt_cases.
    APPEND `6018411.405|2|6018411.41` TO rt_cases.
    APPEND `-194442770.124|0|-194442770` TO rt_cases.
    APPEND `-349142550.5|0|-349142551` TO rt_cases.
    APPEND `-783504.0325|3|-783504.033` TO rt_cases.
    APPEND `-7910888.76976|1|-7910888.8` TO rt_cases.
    APPEND `-96712602.9423|3|-96712602.942` TO rt_cases.
    APPEND `-412951163.46|2|-412951163.46` TO rt_cases.
    APPEND `-469455.231908|0|-469455` TO rt_cases.
    APPEND `56042295.0472|2|56042295.05` TO rt_cases.
    APPEND `-44629132490.7|0|-44629132491` TO rt_cases.
    APPEND `56597453.5216|2|56597453.52` TO rt_cases.
    APPEND `-878809474.41|2|-878809474.41` TO rt_cases.
    APPEND `-676422.6075|3|-676422.608` TO rt_cases.
    APPEND `7175592.10192|1|7175592.1` TO rt_cases.
    APPEND `-3346714.145|2|-3346714.15` TO rt_cases.
    APPEND `53223.621353|3|53223.621` TO rt_cases.
    APPEND `-660451.331923|2|-660451.33` TO rt_cases.
    APPEND `-66804230.1514|1|-66804230.2` TO rt_cases.
    APPEND `-3983166.31942|3|-3983166.319` TO rt_cases.
    APPEND `-5191448.185|2|-5191448.19` TO rt_cases.
    APPEND `-2112115.805|2|-2112115.81` TO rt_cases.
    APPEND `73948019.9883|2|73948019.99` TO rt_cases.
    APPEND `-90290723.15|1|-90290723.2` TO rt_cases.
    APPEND `25766988569.7|0|25766988570` TO rt_cases.
    APPEND `-947587.2086|0|-947587` TO rt_cases.
    APPEND `1395851.54479|2|1395851.54` TO rt_cases.
    APPEND `-756077115.875|2|-756077115.88` TO rt_cases.
    APPEND `-16869976.0155|2|-16869976.02` TO rt_cases.
    APPEND `-374136.277435|3|-374136.277` TO rt_cases.
    APPEND `32907564.95|1|32907565` TO rt_cases.
    APPEND `-746624.8865|3|-746624.887` TO rt_cases.
    APPEND `70413371.55|1|70413371.6` TO rt_cases.
    APPEND `-6225668802.13|1|-6225668802.1` TO rt_cases.
    APPEND `-6187716.185|2|-6187716.19` TO rt_cases.
    APPEND `-48277347922.6|0|-48277347923` TO rt_cases.
    APPEND `-53145276.021|1|-53145276` TO rt_cases.
    APPEND `-49754663.65|1|-49754663.7` TO rt_cases.
    APPEND `-6768688.545|2|-6768688.55` TO rt_cases.
    APPEND `4048204.0071|3|4048204.007` TO rt_cases.
    APPEND `-53576.249077|1|-53576.2` TO rt_cases.
    APPEND `534131309.5|0|534131310` TO rt_cases.
    APPEND `1582695.815|2|1582695.82` TO rt_cases.
    APPEND `3609582944.41|1|3609582944.4` TO rt_cases.
    APPEND `-6712152.065|2|-6712152.07` TO rt_cases.
    APPEND `-432866040.5|0|-432866041` TO rt_cases.
    APPEND `266791050.2|2|266791050.2` TO rt_cases.
    APPEND `-508102.037501|1|-508102` TO rt_cases.
    APPEND `39206636.588|0|39206637` TO rt_cases.
    APPEND `74281814.75|1|74281814.8` TO rt_cases.
    APPEND `2890208.42905|3|2890208.429` TO rt_cases.
    APPEND `496861941.997|2|496861942` TO rt_cases.
    APPEND `54462934.35|1|54462934.4` TO rt_cases.
    APPEND `185744.604648|2|185744.6` TO rt_cases.
    APPEND `81845911.75|1|81845911.8` TO rt_cases.
    APPEND `-389322.438229|2|-389322.44` TO rt_cases.
    APPEND `689204390.5|0|689204391` TO rt_cases.
    APPEND `4373218.995|2|4373219` TO rt_cases.
    APPEND `1899512.06274|2|1899512.06` TO rt_cases.
    APPEND `-5991137.75|1|-5991137.8` TO rt_cases.
    APPEND `-445068304.5|0|-445068305` TO rt_cases.
    APPEND `-43243037.6818|3|-43243037.682` TO rt_cases.
    APPEND `29895050.35|1|29895050.4` TO rt_cases.
    APPEND `-59650887042|0|-59650887042` TO rt_cases.
    APPEND `-326454826.5|0|-326454827` TO rt_cases.
    APPEND `-2295712.4063|3|-2295712.406` TO rt_cases.
    APPEND `-263692820.5|0|-263692821` TO rt_cases.
    APPEND `303230.340417|2|303230.34` TO rt_cases.
    APPEND `-533321.3675|3|-533321.368` TO rt_cases.
    APPEND `-689030.866435|2|-689030.87` TO rt_cases.
    APPEND `648635.592626|2|648635.59` TO rt_cases.
    APPEND `12467817.15|1|12467817.2` TO rt_cases.
    APPEND `6524778.895|2|6524778.9` TO rt_cases.
    APPEND `-863434.3815|3|-863434.382` TO rt_cases.
    APPEND `-939151.356563|0|-939151` TO rt_cases.
    APPEND `-15057111.7188|3|-15057111.719` TO rt_cases.
    APPEND `-632164.5605|3|-632164.561` TO rt_cases.
    APPEND `714151787.919|0|714151788` TO rt_cases.
    APPEND `8870263.315|2|8870263.32` TO rt_cases.
    APPEND `475404.1605|3|475404.161` TO rt_cases.
    APPEND `-40385658.5|0|-40385659` TO rt_cases.
    APPEND `-92266322.0614|2|-92266322.06` TO rt_cases.
    APPEND `-354952991.351|1|-354952991.4` TO rt_cases.
    APPEND `586801.523483|3|586801.523` TO rt_cases.
    APPEND `83407.525169|3|83407.525` TO rt_cases.
    APPEND `-314202907.5|0|-314202908` TO rt_cases.
    APPEND `-80612089.5159|1|-80612089.5` TO rt_cases.
    APPEND `-712060326.58|1|-712060326.6` TO rt_cases.
    APPEND `-91169727.0403|0|-91169727` TO rt_cases.
    APPEND `-424627.0415|3|-424627.042` TO rt_cases.
    APPEND `-6369513.62481|2|-6369513.62` TO rt_cases.
    APPEND `145369.4816|3|145369.482` TO rt_cases.
    APPEND `88741901.5|0|88741902` TO rt_cases.
  ENDMETHOD.

  METHOD round_cases_02.
    APPEND `-5567151.42568|2|-5567151.43` TO rt_cases.
    APPEND `-11826721.3649|0|-11826721` TO rt_cases.
    APPEND `-76432218.35|1|-76432218.4` TO rt_cases.
    APPEND `-804423920.5|0|-804423921` TO rt_cases.
    APPEND `-928096735.5|0|-928096736` TO rt_cases.
    APPEND `-408566292.5|0|-408566293` TO rt_cases.
    APPEND `5987512.435|2|5987512.44` TO rt_cases.
    APPEND `99889191.2878|3|99889191.288` TO rt_cases.
    APPEND `-7082699.12974|1|-7082699.1` TO rt_cases.
    APPEND `6302800.075|2|6302800.08` TO rt_cases.
    APPEND `86952.6875|3|86952.688` TO rt_cases.
    APPEND `509879020.12|2|509879020.12` TO rt_cases.
    APPEND `977592.814357|2|977592.81` TO rt_cases.
    APPEND `558813998.5|0|558813999` TO rt_cases.
    APPEND `132061730.5|0|132061731` TO rt_cases.
    APPEND `-296875.7645|3|-296875.765` TO rt_cases.
    APPEND `4767991.18688|3|4767991.187` TO rt_cases.
    APPEND `-81916532.0674|3|-81916532.067` TO rt_cases.
    APPEND `-6131827.135|2|-6131827.14` TO rt_cases.
    APPEND `8883075.255|2|8883075.26` TO rt_cases.
    APPEND `3733484.3704|0|3733484` TO rt_cases.
    APPEND `-390697.919344|1|-390697.9` TO rt_cases.
    APPEND `76120081.75|1|76120081.8` TO rt_cases.
    APPEND `-505085.0725|3|-505085.073` TO rt_cases.
    APPEND `-192784.1765|3|-192784.177` TO rt_cases.
    APPEND `835211.703556|1|835211.7` TO rt_cases.
    APPEND `367560.88061|0|367561` TO rt_cases.
    APPEND `237061.839848|3|237061.84` TO rt_cases.
    APPEND `-4661756.09133|1|-4661756.1` TO rt_cases.
    APPEND `-45631844.6726|0|-45631845` TO rt_cases.
    APPEND `2974604.63449|2|2974604.63` TO rt_cases.
    APPEND `-825530.2435|3|-825530.244` TO rt_cases.
    APPEND `-82607710.85|1|-82607710.9` TO rt_cases.
    APPEND `211448.8545|3|211448.855` TO rt_cases.
    APPEND `638588.528385|2|638588.53` TO rt_cases.
    APPEND `-4207500123.85|1|-4207500123.9` TO rt_cases.
    APPEND `449907.7325|3|449907.733` TO rt_cases.
    APPEND `-2019036287.35|0|-2019036287` TO rt_cases.
    APPEND `67867810.2803|2|67867810.28` TO rt_cases.
    APPEND `-245941761.5|0|-245941762` TO rt_cases.
    APPEND `1668101.49101|3|1668101.491` TO rt_cases.
    APPEND `8370684.57604|0|8370685` TO rt_cases.
    APPEND `823754.825172|2|823754.83` TO rt_cases.
    APPEND `223390230.5|0|223390231` TO rt_cases.
    APPEND `277435070.321|2|277435070.32` TO rt_cases.
    APPEND `-685698528.5|0|-685698529` TO rt_cases.
    APPEND `-13545384.45|1|-13545384.5` TO rt_cases.
    APPEND `-8544439.355|2|-8544439.36` TO rt_cases.
    APPEND `-70283181568.7|0|-70283181569` TO rt_cases.
    APPEND `-7174489.12779|2|-7174489.13` TO rt_cases.
    APPEND `-91199307.2325|0|-91199307` TO rt_cases.
    APPEND `72633058.05|1|72633058.1` TO rt_cases.
    APPEND `6229389.95|1|6229390` TO rt_cases.
    APPEND `-477855436.5|0|-477855437` TO rt_cases.
    APPEND `634766.124798|3|634766.125` TO rt_cases.
    APPEND `3006988.155|2|3006988.16` TO rt_cases.
    APPEND `-3440039.635|2|-3440039.64` TO rt_cases.
    APPEND `-2675080.72701|3|-2675080.727` TO rt_cases.
    APPEND `-5879912392.43|1|-5879912392.4` TO rt_cases.
    APPEND `535904839.998|1|535904840` TO rt_cases.
    APPEND `-9434738.06603|2|-9434738.07` TO rt_cases.
    APPEND `1147323.905|2|1147323.91` TO rt_cases.
    APPEND `148940711.426|0|148940711` TO rt_cases.
    APPEND `-2217180231.43|0|-2217180231` TO rt_cases.
    APPEND `-49409140.35|1|-49409140.4` TO rt_cases.
    APPEND `374421868.846|2|374421868.85` TO rt_cases.
    APPEND `43257002.95|1|43257003` TO rt_cases.
    APPEND `-502528407.5|0|-502528408` TO rt_cases.
    APPEND `373099.402915|2|373099.4` TO rt_cases.
    APPEND `-100672946.5|0|-100672947` TO rt_cases.
    APPEND `3399335689.07|0|3399335689` TO rt_cases.
    APPEND `922083276.5|0|922083277` TO rt_cases.
    APPEND `63681587.8119|1|63681587.8` TO rt_cases.
    APPEND `-353245.5485|3|-353245.549` TO rt_cases.
    APPEND `31419845.9349|0|31419846` TO rt_cases.
    APPEND `74568752.75|1|74568752.8` TO rt_cases.
    APPEND `-2429623.36664|3|-2429623.367` TO rt_cases.
    APPEND `-8683311.745|2|-8683311.75` TO rt_cases.
    APPEND `7599506.27405|1|7599506.3` TO rt_cases.
    APPEND `81208949.5|0|81208950` TO rt_cases.
    APPEND `51145.727617|3|51145.728` TO rt_cases.
    APPEND `60828293.85|1|60828293.9` TO rt_cases.
    APPEND `51333716.95|1|51333717` TO rt_cases.
    APPEND `-12514843.9042|3|-12514843.904` TO rt_cases.
    APPEND `-111386.416845|1|-111386.4` TO rt_cases.
    APPEND `352648464.5|0|352648465` TO rt_cases.
    APPEND `-508170983.5|0|-508170984` TO rt_cases.
    APPEND `511629646.5|0|511629647` TO rt_cases.
    APPEND `8781481.3822|0|8781481` TO rt_cases.
    APPEND `433386.476689|2|433386.48` TO rt_cases.
    APPEND `330462620.601|2|330462620.6` TO rt_cases.
    APPEND `5522457.225|2|5522457.23` TO rt_cases.
    APPEND `-41631836.75|1|-41631836.8` TO rt_cases.
    APPEND `253648.471335|2|253648.47` TO rt_cases.
    APPEND `-1330423176.48|0|-1330423176` TO rt_cases.
    APPEND `79343526.5|0|79343527` TO rt_cases.
    APPEND `-902206.3515|3|-902206.352` TO rt_cases.
    APPEND `4376930.165|2|4376930.17` TO rt_cases.
    APPEND `99692268.45|1|99692268.5` TO rt_cases.
    APPEND `-5149812.475|2|-5149812.48` TO rt_cases.
  ENDMETHOD.

  METHOD round_cases_03.
    APPEND `1729495.555|2|1729495.56` TO rt_cases.
    APPEND `-59614205.55|1|-59614205.6` TO rt_cases.
    APPEND `-10953847.617|2|-10953847.62` TO rt_cases.
    APPEND `-348061.174177|1|-348061.2` TO rt_cases.
    APPEND `-1304663.165|2|-1304663.17` TO rt_cases.
    APPEND `556636.0965|3|556636.097` TO rt_cases.
    APPEND `-1052657.85|1|-1052657.9` TO rt_cases.
    APPEND `-1456469.32499|0|-1456469` TO rt_cases.
    APPEND `31029716.35|1|31029716.4` TO rt_cases.
    APPEND `-78102582.1411|2|-78102582.14` TO rt_cases.
    APPEND `-696181.357602|2|-696181.36` TO rt_cases.
    APPEND `-1527177.20931|3|-1527177.209` TO rt_cases.
    APPEND `-931264.4195|3|-931264.42` TO rt_cases.
    APPEND `-9854997.75|1|-9854997.8` TO rt_cases.
    APPEND `-5633294.29069|1|-5633294.3` TO rt_cases.
    APPEND `99656131.0421|1|99656131` TO rt_cases.
    APPEND `747663180.5|0|747663181` TO rt_cases.
    APPEND `-8035290.27049|0|-8035290` TO rt_cases.
    APPEND `591630.0305|3|591630.031` TO rt_cases.
    APPEND `6057912.33653|3|6057912.337` TO rt_cases.
    APPEND `164041.810274|2|164041.81` TO rt_cases.
    APPEND `55274094.85|1|55274094.9` TO rt_cases.
    APPEND `955494640.5|0|955494641` TO rt_cases.
    APPEND `-688237.96793|1|-688238` TO rt_cases.
    APPEND `637683409.71|0|637683410` TO rt_cases.
    APPEND `-3529711.41006|2|-3529711.41` TO rt_cases.
    APPEND `7639950.15985|3|7639950.16` TO rt_cases.
    APPEND `69437782.15|1|69437782.2` TO rt_cases.
    APPEND `50043146.8344|3|50043146.834` TO rt_cases.
    APPEND `574809.245|2|574809.25` TO rt_cases.
    APPEND `840347353.5|0|840347354` TO rt_cases.
    APPEND `29394054.275|0|29394054` TO rt_cases.
    APPEND `7793110.05|1|7793110.1` TO rt_cases.
    APPEND `-63040398.7271|0|-63040399` TO rt_cases.
    APPEND `1214689.825|2|1214689.83` TO rt_cases.
    APPEND `-6351801.91833|3|-6351801.918` TO rt_cases.
    APPEND `3832413.334|2|3832413.33` TO rt_cases.
    APPEND `867961.5875|3|867961.588` TO rt_cases.
    APPEND `1133169.005|2|1133169.01` TO rt_cases.
    APPEND `-718706559.5|0|-718706560` TO rt_cases.
    APPEND `4025110.7861|1|4025110.8` TO rt_cases.
    APPEND `-624793.054585|1|-624793.1` TO rt_cases.
    APPEND `1192596928.83|0|1192596929` TO rt_cases.
    APPEND `701766665.829|1|701766665.8` TO rt_cases.
    APPEND `416429.808609|0|416430` TO rt_cases.
    APPEND `722522142.088|2|722522142.09` TO rt_cases.
    APPEND `-80504923.3606|2|-80504923.36` TO rt_cases.
    APPEND `352791.534447|1|352791.5` TO rt_cases.
    APPEND `-3309755.4103|2|-3309755.41` TO rt_cases.
    APPEND `-2834.5725|3|-2834.573` TO rt_cases.
    APPEND `559756.9355|3|559756.936` TO rt_cases.
    APPEND `96247446.75|1|96247446.8` TO rt_cases.
    APPEND `752921646.413|2|752921646.41` TO rt_cases.
    APPEND `-8044.654806|3|-8044.655` TO rt_cases.
    APPEND `4190675132.2|1|4190675132.2` TO rt_cases.
    APPEND `-5619502.57068|0|-5619503` TO rt_cases.
    APPEND `-84201662.0634|1|-84201662.1` TO rt_cases.
    APPEND `559557900.5|0|559557901` TO rt_cases.
    APPEND `360141.7035|3|360141.704` TO rt_cases.
    APPEND `424029.0475|3|424029.048` TO rt_cases.
    APPEND `251781180.5|0|251781181` TO rt_cases.
    APPEND `46800636.25|1|46800636.3` TO rt_cases.
    APPEND `209436170.984|1|209436171` TO rt_cases.
    APPEND `-90872752797.2|0|-90872752797` TO rt_cases.
    APPEND `-578570415.303|0|-578570415` TO rt_cases.
    APPEND `-374383.3375|3|-374383.338` TO rt_cases.
    APPEND `-419241.97158|2|-419241.97` TO rt_cases.
    APPEND `-131852580.891|0|-131852581` TO rt_cases.
    APPEND `1175187.705|2|1175187.71` TO rt_cases.
    APPEND `-65120274227.2|0|-65120274227` TO rt_cases.
    APPEND `-413959.565319|3|-413959.565` TO rt_cases.
    APPEND `-888808469.5|0|-888808470` TO rt_cases.
    APPEND `-105524.008864|3|-105524.009` TO rt_cases.
    APPEND `1318267.805|2|1318267.81` TO rt_cases.
    APPEND `6572355.20647|3|6572355.206` TO rt_cases.
    APPEND `-77546726.8522|0|-77546727` TO rt_cases.
    APPEND `-676723.0755|3|-676723.076` TO rt_cases.
    APPEND `49875504.05|1|49875504.1` TO rt_cases.
    APPEND `-747754.1445|3|-747754.145` TO rt_cases.
    APPEND `-13989253.55|1|-13989253.6` TO rt_cases.
    APPEND `-1848147.275|2|-1848147.28` TO rt_cases.
    APPEND `-1368360.8748|3|-1368360.875` TO rt_cases.
    APPEND `-932773.978379|2|-932773.98` TO rt_cases.
    APPEND `36931978.3371|3|36931978.337` TO rt_cases.
    APPEND `-663655.3365|3|-663655.337` TO rt_cases.
    APPEND `-76941507.423|1|-76941507.4` TO rt_cases.
    APPEND `-91869722.7207|3|-91869722.721` TO rt_cases.
    APPEND `197731.3725|3|197731.373` TO rt_cases.
    APPEND `9097947.61882|3|9097947.619` TO rt_cases.
    APPEND `919573.1005|3|919573.101` TO rt_cases.
    APPEND `474200.2655|3|474200.266` TO rt_cases.
    APPEND `-621761520.5|0|-621761521` TO rt_cases.
    APPEND `371981.817689|1|371981.8` TO rt_cases.
    APPEND `-3197122.225|2|-3197122.23` TO rt_cases.
    APPEND `-482534.403642|0|-482534` TO rt_cases.
    APPEND `202890.2785|3|202890.279` TO rt_cases.
    APPEND `-4580375.57427|0|-4580376` TO rt_cases.
    APPEND `-5429160.44861|3|-5429160.449` TO rt_cases.
    APPEND `-42525690686.9|0|-42525690687` TO rt_cases.
    APPEND `-706016.6215|3|-706016.622` TO rt_cases.
  ENDMETHOD.

  METHOD round_cases_04.
    APPEND `3860360.29752|0|3860360` TO rt_cases.
    APPEND `-26393884710.9|0|-26393884711` TO rt_cases.
    APPEND `6445261.17525|3|6445261.175` TO rt_cases.
    APPEND `6731071.79508|2|6731071.8` TO rt_cases.
    APPEND `497252.846305|3|497252.846` TO rt_cases.
    APPEND `-51919901.8463|2|-51919901.85` TO rt_cases.
    APPEND `280560.5555|3|280560.556` TO rt_cases.
    APPEND `-22461003.9332|0|-22461004` TO rt_cases.
    APPEND `61924096.3919|3|61924096.392` TO rt_cases.
    APPEND `3321627.925|2|3321627.93` TO rt_cases.
    APPEND `995187.324082|3|995187.324` TO rt_cases.
    APPEND `316213764.5|0|316213765` TO rt_cases.
    APPEND `60142915.241|0|60142915` TO rt_cases.
    APPEND `99953529.35|1|99953529.4` TO rt_cases.
    APPEND `-700505285.5|0|-700505286` TO rt_cases.
    APPEND `-6290997.73223|3|-6290997.732` TO rt_cases.
    APPEND `-1420688.56335|2|-1420688.56` TO rt_cases.
    APPEND `-181006.6495|3|-181006.65` TO rt_cases.
    APPEND `-295294.735134|3|-295294.735` TO rt_cases.
    APPEND `77342218832.4|0|77342218832` TO rt_cases.
    APPEND `-2004183.40773|2|-2004183.41` TO rt_cases.
    APPEND `-278883.6015|3|-278883.602` TO rt_cases.
    APPEND `-7783054.73767|3|-7783054.738` TO rt_cases.
    APPEND `-99177.129016|3|-99177.129` TO rt_cases.
    APPEND `-479242.890644|2|-479242.89` TO rt_cases.
    APPEND `410147352.5|0|410147353` TO rt_cases.
    APPEND `-8878689.9541|3|-8878689.954` TO rt_cases.
    APPEND `-98723.01876|3|-98723.019` TO rt_cases.
    APPEND `652924.520022|2|652924.52` TO rt_cases.
    APPEND `-39484278.5524|3|-39484278.552` TO rt_cases.
    APPEND `-68638349.65|1|-68638349.7` TO rt_cases.
    APPEND `9987770.545|2|9987770.55` TO rt_cases.
    APPEND `-629873585.09|1|-629873585.1` TO rt_cases.
    APPEND `-99765.485|2|-99765.49` TO rt_cases.
    APPEND `157451.75|1|157451.8` TO rt_cases.
    APPEND `1042512617.49|0|1042512617` TO rt_cases.
    APPEND `716097323.5|0|716097324` TO rt_cases.
    APPEND `3092279.655|2|3092279.66` TO rt_cases.
    APPEND `353660704.222|2|353660704.22` TO rt_cases.
    APPEND `72127913.046|0|72127913` TO rt_cases.
    APPEND `91012092.45|1|91012092.5` TO rt_cases.
    APPEND `7658813.67353|3|7658813.674` TO rt_cases.
    APPEND `-8315723.3893|2|-8315723.39` TO rt_cases.
    APPEND `-7017451.175|2|-7017451.18` TO rt_cases.
    APPEND `-236824919.419|2|-236824919.42` TO rt_cases.
    APPEND `840884.0975|3|840884.098` TO rt_cases.
    APPEND `-30994.1755|3|-30994.176` TO rt_cases.
    APPEND `-349378190.5|0|-349378191` TO rt_cases.
    APPEND `-673404769.5|0|-673404770` TO rt_cases.
    APPEND `10406292.55|1|10406292.6` TO rt_cases.
    APPEND `-7325968.065|2|-7325968.07` TO rt_cases.
    APPEND `1221936125.12|1|1221936125.1` TO rt_cases.
    APPEND `94784056.1571|3|94784056.157` TO rt_cases.
    APPEND `3522612.62868|2|3522612.63` TO rt_cases.
    APPEND `-403091813.5|0|-403091814` TO rt_cases.
    APPEND `39097460.45|1|39097460.5` TO rt_cases.
    APPEND `-248288605.189|2|-248288605.19` TO rt_cases.
    APPEND `935204137.5|0|935204138` TO rt_cases.
    APPEND `-318839.594697|2|-318839.59` TO rt_cases.
    APPEND `3561556.13701|3|3561556.137` TO rt_cases.
    APPEND `330173.0615|3|330173.062` TO rt_cases.
    APPEND `-987295.7005|3|-987295.701` TO rt_cases.
    APPEND `-546337836.5|0|-546337837` TO rt_cases.
    APPEND `7972662.865|2|7972662.87` TO rt_cases.
    APPEND `750438.112231|3|750438.112` TO rt_cases.
    APPEND `35592307.55|1|35592307.6` TO rt_cases.
    APPEND `-710349055.923|0|-710349056` TO rt_cases.
    APPEND `9342996.595|2|9342996.6` TO rt_cases.
    APPEND `5943728.65998|2|5943728.66` TO rt_cases.
    APPEND `9955363130.07|0|9955363130` TO rt_cases.
    APPEND `773674128.5|0|773674129` TO rt_cases.
    APPEND `-39437305.5|0|-39437306` TO rt_cases.
    APPEND `59412995.5|0|59412996` TO rt_cases.
    APPEND `60509520.45|1|60509520.5` TO rt_cases.
    APPEND `-804198.2885|3|-804198.289` TO rt_cases.
    APPEND `21690424.55|1|21690424.6` TO rt_cases.
    APPEND `261890.7985|3|261890.799` TO rt_cases.
    APPEND `94876499.1417|3|94876499.142` TO rt_cases.
    APPEND `-49141607.1564|3|-49141607.156` TO rt_cases.
    APPEND `361543.2095|3|361543.21` TO rt_cases.
    APPEND `-2755185.6068|0|-2755186` TO rt_cases.
    APPEND `731441610.5|0|731441611` TO rt_cases.
    APPEND `800491.5975|3|800491.598` TO rt_cases.
    APPEND `-6439371.27385|3|-6439371.274` TO rt_cases.
    APPEND `2795287.285|2|2795287.29` TO rt_cases.
    APPEND `-7193217.88506|2|-7193217.89` TO rt_cases.
    APPEND `14400.611106|2|14400.61` TO rt_cases.
    APPEND `409247.991119|1|409248` TO rt_cases.
    APPEND `-4759742575.86|1|-4759742575.9` TO rt_cases.
    APPEND `-278651.7725|3|-278651.773` TO rt_cases.
    APPEND `-620816.2765|3|-620816.277` TO rt_cases.
    APPEND `-944365.3775|3|-944365.378` TO rt_cases.
    APPEND `978032979.5|0|978032980` TO rt_cases.
    APPEND `-3425150926.64|1|-3425150926.6` TO rt_cases.
    APPEND `9211241.786|3|9211241.786` TO rt_cases.
    APPEND `2372588.435|2|2372588.44` TO rt_cases.
    APPEND `36785070.86|1|36785070.9` TO rt_cases.
    APPEND `-756898.8045|3|-756898.805` TO rt_cases.
    APPEND `98563808.75|1|98563808.8` TO rt_cases.
    APPEND `130425.1125|3|130425.113` TO rt_cases.
  ENDMETHOD.

  METHOD round_cases_05.
    APPEND `305785319.5|0|305785320` TO rt_cases.
    APPEND `569608662.004|2|569608662` TO rt_cases.
    APPEND `-989111.387902|0|-989111` TO rt_cases.
    APPEND `61658531.55|1|61658531.6` TO rt_cases.
    APPEND `263481.4315|3|263481.432` TO rt_cases.
    APPEND `-830220.045115|3|-830220.045` TO rt_cases.
    APPEND `-7005207.315|2|-7005207.32` TO rt_cases.
    APPEND `733620.465923|1|733620.5` TO rt_cases.
    APPEND `-2177.2985|3|-2177.299` TO rt_cases.
    APPEND `629320055.5|0|629320056` TO rt_cases.
    APPEND `-2849077.485|2|-2849077.49` TO rt_cases.
    APPEND `-62045.505|2|-62045.51` TO rt_cases.
    APPEND `82059960.5016|3|82059960.502` TO rt_cases.
    APPEND `64397731.5|0|64397732` TO rt_cases.
    APPEND `94557443.75|1|94557443.8` TO rt_cases.
    APPEND `7919218.39035|0|7919218` TO rt_cases.
    APPEND `6434189.765|2|6434189.77` TO rt_cases.
    APPEND `195223.495|2|195223.5` TO rt_cases.
    APPEND `612184.7235|3|612184.724` TO rt_cases.
    APPEND `9347077.085|2|9347077.09` TO rt_cases.
    APPEND `-8937053.335|2|-8937053.34` TO rt_cases.
    APPEND `-961411533.583|1|-961411533.6` TO rt_cases.
    APPEND `94078442.95|1|94078443` TO rt_cases.
    APPEND `-619606571.5|0|-619606572` TO rt_cases.
    APPEND `9016158.95677|3|9016158.957` TO rt_cases.
    APPEND `-14510566960.9|0|-14510566961` TO rt_cases.
    APPEND `2847498.625|2|2847498.63` TO rt_cases.
    APPEND `-706705.3655|3|-706705.366` TO rt_cases.
    APPEND `55888711.9113|1|55888711.9` TO rt_cases.
    APPEND `405314.3135|3|405314.314` TO rt_cases.
    APPEND `-866115.25318|1|-866115.3` TO rt_cases.
    APPEND `-7893724.29397|1|-7893724.3` TO rt_cases.
    APPEND `5710562.25539|2|5710562.26` TO rt_cases.
    APPEND `-16991278.15|1|-16991278.2` TO rt_cases.
    APPEND `182611700.01|1|182611700` TO rt_cases.
    APPEND `98668896.3937|3|98668896.394` TO rt_cases.
    APPEND `-300612.7915|3|-300612.792` TO rt_cases.
    APPEND `-6174350.695|2|-6174350.7` TO rt_cases.
    APPEND `-2333003.59936|1|-2333003.6` TO rt_cases.
    APPEND `-8831832.175|2|-8831832.18` TO rt_cases.
    APPEND `-22645269.05|1|-22645269.1` TO rt_cases.
    APPEND `1397694.4714|3|1397694.471` TO rt_cases.
    APPEND `-2205263778.19|1|-2205263778.2` TO rt_cases.
    APPEND `-567718048.452|2|-567718048.45` TO rt_cases.
    APPEND `-1428696.395|2|-1428696.4` TO rt_cases.
    APPEND `26982561857.8|0|26982561858` TO rt_cases.
    APPEND `83512817.045|0|83512817` TO rt_cases.
    APPEND `655537.094653|0|655537` TO rt_cases.
    APPEND `587907721.565|1|587907721.6` TO rt_cases.
    APPEND `-7297533.665|2|-7297533.67` TO rt_cases.
    APPEND `-906213.000631|2|-906213` TO rt_cases.
    APPEND `-73767019.678|1|-73767019.7` TO rt_cases.
    APPEND `-107396881.5|0|-107396882` TO rt_cases.
    APPEND `-159618.1885|3|-159618.189` TO rt_cases.
    APPEND `-581140.5625|3|-581140.563` TO rt_cases.
    APPEND `89995807.1759|0|89995807` TO rt_cases.
    APPEND `779372178.5|0|779372179` TO rt_cases.
    APPEND `-3513256.545|2|-3513256.55` TO rt_cases.
    APPEND `560500732.981|2|560500732.98` TO rt_cases.
    APPEND `4493142.105|2|4493142.11` TO rt_cases.
    APPEND `-233900.9965|3|-233900.997` TO rt_cases.
    APPEND `8672285.395|2|8672285.4` TO rt_cases.
    APPEND `-76966326.45|1|-76966326.5` TO rt_cases.
    APPEND `6704999936.39|0|6704999936` TO rt_cases.
    APPEND `-532382098.5|0|-532382099` TO rt_cases.
    APPEND `61121527.75|1|61121527.8` TO rt_cases.
    APPEND `-829204.562813|3|-829204.563` TO rt_cases.
    APPEND `-75122725640.2|0|-75122725640` TO rt_cases.
    APPEND `8956090.88309|0|8956091` TO rt_cases.
    APPEND `98425410.15|1|98425410.2` TO rt_cases.
    APPEND `-2160007.635|2|-2160007.64` TO rt_cases.
    APPEND `24427324408.2|0|24427324408` TO rt_cases.
    APPEND `-11125231.95|1|-11125232` TO rt_cases.
    APPEND `-979478.75578|3|-979478.756` TO rt_cases.
    APPEND `-86344888.95|1|-86344889` TO rt_cases.
    APPEND `337771.901078|3|337771.901` TO rt_cases.
    APPEND `-87027475.6096|1|-87027475.6` TO rt_cases.
    APPEND `88704890.9995|2|88704891` TO rt_cases.
    APPEND `-3497243628.26|1|-3497243628.3` TO rt_cases.
    APPEND `-16322.9825|3|-16322.983` TO rt_cases.
    APPEND `65366.8745|3|65366.875` TO rt_cases.
    APPEND `-9362262371.6|0|-9362262372` TO rt_cases.
    APPEND `-2522374.55081|1|-2522374.6` TO rt_cases.
    APPEND `440087689.072|2|440087689.07` TO rt_cases.
    APPEND `64688449.25|1|64688449.3` TO rt_cases.
    APPEND `226319.8105|3|226319.811` TO rt_cases.
    APPEND `30899096.5343|1|30899096.5` TO rt_cases.
    APPEND `-899214697.5|0|-899214698` TO rt_cases.
    APPEND `699730261.5|0|699730262` TO rt_cases.
    APPEND `3163152.62674|1|3163152.6` TO rt_cases.
    APPEND `-37675935.45|1|-37675935.5` TO rt_cases.
    APPEND `-5601460.945|2|-5601460.95` TO rt_cases.
    APPEND `29146136.65|1|29146136.7` TO rt_cases.
    APPEND `-3547544.455|2|-3547544.46` TO rt_cases.
    APPEND `230720.577556|0|230721` TO rt_cases.
    APPEND `609236.489839|3|609236.49` TO rt_cases.
    APPEND `-678120896.525|1|-678120896.5` TO rt_cases.
    APPEND `-12820213.685|0|-12820214` TO rt_cases.
    APPEND `-518656.935566|3|-518656.936` TO rt_cases.
    APPEND `-3538228.915|2|-3538228.92` TO rt_cases.
  ENDMETHOD.

  METHOD round_cases_06.
    APPEND `-768389797.5|0|-768389798` TO rt_cases.
    APPEND `-9009217.375|2|-9009217.38` TO rt_cases.
    APPEND `252177646.5|0|252177647` TO rt_cases.
    APPEND `974808.9785|3|974808.979` TO rt_cases.
    APPEND `688651.735|2|688651.74` TO rt_cases.
    APPEND `-10315971.839|3|-10315971.839` TO rt_cases.
    APPEND `93806281.2366|1|93806281.2` TO rt_cases.
    APPEND `71087086.05|1|71087086.1` TO rt_cases.
    APPEND `6466663.115|2|6466663.12` TO rt_cases.
    APPEND `-20352605429.2|0|-20352605429` TO rt_cases.
    APPEND `-79596918.65|1|-79596918.7` TO rt_cases.
    APPEND `-993021.220493|0|-993021` TO rt_cases.
    APPEND `9222.4065|3|9222.407` TO rt_cases.
    APPEND `-7422599.86701|3|-7422599.867` TO rt_cases.
    APPEND `-712270.492182|3|-712270.492` TO rt_cases.
    APPEND `-3159736.315|2|-3159736.32` TO rt_cases.
    APPEND `7724325.58364|0|7724326` TO rt_cases.
    APPEND `34708419.15|1|34708419.2` TO rt_cases.
    APPEND `-3330089.655|2|-3330089.66` TO rt_cases.
    APPEND `1078394.055|2|1078394.06` TO rt_cases.
    APPEND `-633251337.5|0|-633251338` TO rt_cases.
    APPEND `-594207.1545|3|-594207.155` TO rt_cases.
    APPEND `-42547071.05|1|-42547071.1` TO rt_cases.
    APPEND `-9334554.87203|2|-9334554.87` TO rt_cases.
    APPEND `-18520156.95|1|-18520157` TO rt_cases.
    APPEND `-170582709.451|2|-170582709.45` TO rt_cases.
    APPEND `2878658.26061|2|2878658.26` TO rt_cases.
    APPEND `7278908691.81|1|7278908691.8` TO rt_cases.
    APPEND `-65705184.55|1|-65705184.6` TO rt_cases.
    APPEND `-9781862.35|1|-9781862.4` TO rt_cases.
    APPEND `-585017.678481|2|-585017.68` TO rt_cases.
    APPEND `937343698.5|0|937343699` TO rt_cases.
    APPEND `-8181923.64338|0|-8181924` TO rt_cases.
    APPEND `-616831.1335|3|-616831.134` TO rt_cases.
    APPEND `-3055231314.28|0|-3055231314` TO rt_cases.
    APPEND `821190.578911|1|821190.6` TO rt_cases.
    APPEND `11196136.5|0|11196137` TO rt_cases.
    APPEND `-73953325.4196|2|-73953325.42` TO rt_cases.
    APPEND `33013522.5|0|33013523` TO rt_cases.
    APPEND `358095.7635|3|358095.764` TO rt_cases.
    APPEND `46637340.9639|0|46637341` TO rt_cases.
    APPEND `831469.4485|3|831469.449` TO rt_cases.
    APPEND `-2287151534.49|0|-2287151534` TO rt_cases.
    APPEND `-1734221.71828|3|-1734221.718` TO rt_cases.
    APPEND `-28614965.9745|1|-28614966` TO rt_cases.
    APPEND `-90828605.25|1|-90828605.3` TO rt_cases.
    APPEND `-205229628.066|2|-205229628.07` TO rt_cases.
    APPEND `8512738.84666|1|8512738.8` TO rt_cases.
    APPEND `527389.238281|0|527389` TO rt_cases.
    APPEND `1692021035.45|1|1692021035.5` TO rt_cases.
    APPEND `-1253484.365|2|-1253484.37` TO rt_cases.
    APPEND `-6344690.02645|1|-6344690` TO rt_cases.
    APPEND `5665891.685|2|5665891.69` TO rt_cases.
    APPEND `882193.8295|3|882193.83` TO rt_cases.
    APPEND `-30382375.2106|3|-30382375.211` TO rt_cases.
    APPEND `-115588.792602|1|-115588.8` TO rt_cases.
    APPEND `-718261.933608|1|-718261.9` TO rt_cases.
    APPEND `55233113.05|1|55233113.1` TO rt_cases.
    APPEND `-2392162.445|2|-2392162.45` TO rt_cases.
    APPEND `74842453.95|1|74842454` TO rt_cases.
    APPEND `646856050.5|0|646856051` TO rt_cases.
    APPEND `692943.043378|0|692943` TO rt_cases.
    APPEND `-390513922.5|0|-390513923` TO rt_cases.
    APPEND `11424978.85|1|11424978.9` TO rt_cases.
    APPEND `-12011179.65|1|-12011179.7` TO rt_cases.
    APPEND `-248071674.999|1|-248071675` TO rt_cases.
    APPEND `-413883.7765|3|-413883.777` TO rt_cases.
    APPEND `375461587.5|0|375461588` TO rt_cases.
    APPEND `-682544.6945|3|-682544.695` TO rt_cases.
    APPEND `-91221001.5|0|-91221002` TO rt_cases.
    APPEND `80304367.2446|2|80304367.24` TO rt_cases.
    APPEND `5191463.81026|1|5191463.8` TO rt_cases.
    APPEND `563509694.5|0|563509695` TO rt_cases.
    APPEND `596917.56478|3|596917.565` TO rt_cases.
    APPEND `-360102.071175|3|-360102.071` TO rt_cases.
    APPEND `1543835.285|2|1543835.29` TO rt_cases.
    APPEND `-211278.2475|3|-211278.248` TO rt_cases.
    APPEND `723352625.5|0|723352626` TO rt_cases.
    APPEND `70062773.45|1|70062773.5` TO rt_cases.
    APPEND `-862084.6335|3|-862084.634` TO rt_cases.
    APPEND `-140440824.5|0|-140440825` TO rt_cases.
    APPEND `975514.510687|3|975514.511` TO rt_cases.
    APPEND `-624286335.93|1|-624286335.9` TO rt_cases.
    APPEND `-35661272.3381|1|-35661272.3` TO rt_cases.
    APPEND `6236692708.98|1|6236692709` TO rt_cases.
    APPEND `-4236018149.82|0|-4236018150` TO rt_cases.
    APPEND `164006421.5|0|164006422` TO rt_cases.
    APPEND `-813688.0185|3|-813688.019` TO rt_cases.
    APPEND `20538611.4877|2|20538611.49` TO rt_cases.
    APPEND `-372974.003159|3|-372974.003` TO rt_cases.
    APPEND `6101629.515|2|6101629.52` TO rt_cases.
    APPEND `2568303.05|1|2568303.1` TO rt_cases.
    APPEND `10871868.3683|2|10871868.37` TO rt_cases.
    APPEND `406574179.5|0|406574180` TO rt_cases.
    APPEND `2981045.845|2|2981045.85` TO rt_cases.
    APPEND `-48934198622.8|0|-48934198623` TO rt_cases.
    APPEND `-8800079.265|2|-8800079.27` TO rt_cases.
    APPEND `2297666.40543|3|2297666.405` TO rt_cases.
    APPEND `-16915544.9819|1|-16915545` TO rt_cases.
    APPEND `-105526.492173|1|-105526.5` TO rt_cases.
  ENDMETHOD.

  METHOD minor_cases_01.
    APPEND `-6838652661893|0|-6838652661893|-68386526618.93` TO rt_cases.
    APPEND `-85860721975.29|2|-8586072197529|-85860721975.29` TO rt_cases.
    APPEND `4627156038699|0|4627156038699|46271560386.99` TO rt_cases.
    APPEND `5113670337135|0|5113670337135|51136703371.35` TO rt_cases.
    APPEND `-6288364432214|0|-6288364432214|-62883644322.14` TO rt_cases.
    APPEND `7765019758.63|3|7765019758630|77650197586.3` TO rt_cases.
    APPEND `62710079490.64|2|6271007949064|62710079490.64` TO rt_cases.
    APPEND `-8881346744.615|3|-8881346744615|-88813467446.15` TO rt_cases.
    APPEND `-6441949268198|0|-6441949268198|-64419492681.98` TO rt_cases.
    APPEND `6550199050.486|3|6550199050486|65501990504.86` TO rt_cases.
    APPEND `-6296152724.977|3|-6296152724977|-62961527249.77` TO rt_cases.
    APPEND `-49681974810.39|2|-4968197481039|-49681974810.39` TO rt_cases.
    APPEND `63518091164.91|2|6351809116491|63518091164.91` TO rt_cases.
    APPEND `4403953152900|0|4403953152900|44039531529` TO rt_cases.
    APPEND `753064146.33|3|753064146330|7530641463.3` TO rt_cases.
    APPEND `86122040891.22|2|8612204089122|86122040891.22` TO rt_cases.
    APPEND `-9002755559.535|3|-9002755559535|-90027555595.35` TO rt_cases.
    APPEND `-6589781304.793|3|-6589781304793|-65897813047.93` TO rt_cases.
    APPEND `-8463044514.615|3|-8463044514615|-84630445146.15` TO rt_cases.
    APPEND `75174517485.89|2|7517451748589|75174517485.89` TO rt_cases.
    APPEND `15523110045.27|2|1552311004527|15523110045.27` TO rt_cases.
    APPEND `5075309879.096|3|5075309879096|50753098790.96` TO rt_cases.
    APPEND `81064388236.23|2|8106438823623|81064388236.23` TO rt_cases.
    APPEND `11139951094.71|2|1113995109471|11139951094.71` TO rt_cases.
    APPEND `-9874375937.581|3|-9874375937581|-98743759375.81` TO rt_cases.
    APPEND `-9514650209.511|3|-9514650209511|-95146502095.11` TO rt_cases.
    APPEND `289878337405|0|289878337405|2898783374.05` TO rt_cases.
    APPEND `70102964689.08|2|7010296468908|70102964689.08` TO rt_cases.
    APPEND `11666587191.7|2|1166658719170|11666587191.7` TO rt_cases.
    APPEND `7697782542.594|3|7697782542594|76977825425.94` TO rt_cases.
    APPEND `-972860362400|0|-972860362400|-9728603624` TO rt_cases.
    APPEND `-5531892905.346|3|-5531892905346|-55318929053.46` TO rt_cases.
    APPEND `7399370709761|0|7399370709761|73993707097.61` TO rt_cases.
    APPEND `-2025704601038|0|-2025704601038|-20257046010.38` TO rt_cases.
    APPEND `7905312684251|0|7905312684251|79053126842.51` TO rt_cases.
    APPEND `-8322468811497|0|-8322468811497|-83224688114.97` TO rt_cases.
    APPEND `7090671645955|0|7090671645955|70906716459.55` TO rt_cases.
    APPEND `51294414052.14|2|5129441405214|51294414052.14` TO rt_cases.
    APPEND `9480637210030|0|9480637210030|94806372100.3` TO rt_cases.
    APPEND `-8303395672.01|3|-8303395672010|-83033956720.1` TO rt_cases.
    APPEND `4997822294.856|3|4997822294856|49978222948.56` TO rt_cases.
    APPEND `-37114524536.25|2|-3711452453625|-37114524536.25` TO rt_cases.
    APPEND `6460047982172|0|6460047982172|64600479821.72` TO rt_cases.
    APPEND `-3043086363061|0|-3043086363061|-30430863630.61` TO rt_cases.
    APPEND `-49034725829.83|2|-4903472582983|-49034725829.83` TO rt_cases.
    APPEND `29115033643.01|2|2911503364301|29115033643.01` TO rt_cases.
    APPEND `9265823326.719|3|9265823326719|92658233267.19` TO rt_cases.
    APPEND `5674913599.83|3|5674913599830|56749135998.3` TO rt_cases.
    APPEND `63777288953.2|2|6377728895320|63777288953.2` TO rt_cases.
    APPEND `-4820065133544|0|-4820065133544|-48200651335.44` TO rt_cases.
    APPEND `-85843936446.92|2|-8584393644692|-85843936446.92` TO rt_cases.
    APPEND `17420688483.74|2|1742068848374|17420688483.74` TO rt_cases.
    APPEND `5644013623754|0|5644013623754|56440136237.54` TO rt_cases.
    APPEND `-6790514800514|0|-6790514800514|-67905148005.14` TO rt_cases.
    APPEND `8162013727.591|3|8162013727591|81620137275.91` TO rt_cases.
    APPEND `-49816351666.63|2|-4981635166663|-49816351666.63` TO rt_cases.
    APPEND `-56822970191.84|2|-5682297019184|-56822970191.84` TO rt_cases.
    APPEND `-85279847856.81|2|-8527984785681|-85279847856.81` TO rt_cases.
    APPEND `22307010423.19|2|2230701042319|22307010423.19` TO rt_cases.
    APPEND `-3126111313657|0|-3126111313657|-31261113136.57` TO rt_cases.
    APPEND `4304450149967|0|4304450149967|43044501499.67` TO rt_cases.
    APPEND `1448613601.612|3|1448613601612|14486136016.12` TO rt_cases.
    APPEND `-14156659177.92|2|-1415665917792|-14156659177.92` TO rt_cases.
    APPEND `-831951801.228|3|-831951801228|-8319518012.28` TO rt_cases.
    APPEND `-9242246848.397|3|-9242246848397|-92422468483.97` TO rt_cases.
    APPEND `-70314531349.98|2|-7031453134998|-70314531349.98` TO rt_cases.
    APPEND `-41000771505.08|2|-4100077150508|-41000771505.08` TO rt_cases.
    APPEND `-9613791513.717|3|-9613791513717|-96137915137.17` TO rt_cases.
    APPEND `-8237280790.704|3|-8237280790704|-82372807907.04` TO rt_cases.
    APPEND `-8503560631.127|3|-8503560631127|-85035606311.27` TO rt_cases.
    APPEND `1043214661.759|3|1043214661759|10432146617.59` TO rt_cases.
    APPEND `8857418421.277|3|8857418421277|88574184212.77` TO rt_cases.
    APPEND `6340501423535|0|6340501423535|63405014235.35` TO rt_cases.
    APPEND `8040142748.335|3|8040142748335|80401427483.35` TO rt_cases.
    APPEND `-81718845062.53|2|-8171884506253|-81718845062.53` TO rt_cases.
    APPEND `176253040047|0|176253040047|1762530400.47` TO rt_cases.
    APPEND `-5889806032.072|3|-5889806032072|-58898060320.72` TO rt_cases.
    APPEND `-58495614034.89|2|-5849561403489|-58495614034.89` TO rt_cases.
    APPEND `-7373652426.483|3|-7373652426483|-73736524264.83` TO rt_cases.
    APPEND `-1241605714.442|3|-1241605714442|-12416057144.42` TO rt_cases.
    APPEND `-12771391585.85|2|-1277139158585|-12771391585.85` TO rt_cases.
    APPEND `3668872539056|0|3668872539056|36688725390.56` TO rt_cases.
    APPEND `-772887417.728|3|-772887417728|-7728874177.28` TO rt_cases.
    APPEND `-2908896346.763|3|-2908896346763|-29088963467.63` TO rt_cases.
    APPEND `-3870149387238|0|-3870149387238|-38701493872.38` TO rt_cases.
    APPEND `215427347.962|3|215427347962|2154273479.62` TO rt_cases.
    APPEND `-5765460951237|0|-5765460951237|-57654609512.37` TO rt_cases.
    APPEND `83336341879.42|2|8333634187942|83336341879.42` TO rt_cases.
    APPEND `70376881558.74|2|7037688155874|70376881558.74` TO rt_cases.
    APPEND `8705675661597|0|8705675661597|87056756615.97` TO rt_cases.
    APPEND `-83503889144.32|2|-8350388914432|-83503889144.32` TO rt_cases.
    APPEND `-73248010021.02|2|-7324801002102|-73248010021.02` TO rt_cases.
    APPEND `-9345114870549|0|-9345114870549|-93451148705.49` TO rt_cases.
    APPEND `-1925226748743|0|-1925226748743|-19252267487.43` TO rt_cases.
    APPEND `-3542829701939|0|-3542829701939|-35428297019.39` TO rt_cases.
    APPEND `-1022738345.28|2|-102273834528|-1022738345.28` TO rt_cases.
    APPEND `-68222896583.02|2|-6822289658302|-68222896583.02` TO rt_cases.
    APPEND `-4488482679.521|3|-4488482679521|-44884826795.21` TO rt_cases.
    APPEND `-56869128263.66|2|-5686912826366|-56869128263.66` TO rt_cases.
    APPEND `8677943676.563|3|8677943676563|86779436765.63` TO rt_cases.
  ENDMETHOD.

  METHOD minor_cases_02.
    APPEND `-6328162072948|0|-6328162072948|-63281620729.48` TO rt_cases.
    APPEND `3100073627.251|3|3100073627251|31000736272.51` TO rt_cases.
    APPEND `158499424343|0|158499424343|1584994243.43` TO rt_cases.
    APPEND `9136090913130|0|9136090913130|91360909131.3` TO rt_cases.
    APPEND `-7723278522045|0|-7723278522045|-77232785220.45` TO rt_cases.
    APPEND `3626185027404|0|3626185027404|36261850274.04` TO rt_cases.
    APPEND `-182365707886|0|-182365707886|-1823657078.86` TO rt_cases.
    APPEND `-1313699239.978|3|-1313699239978|-13136992399.78` TO rt_cases.
    APPEND `40449812398.2|2|4044981239820|40449812398.2` TO rt_cases.
    APPEND `5724703566915|0|5724703566915|57247035669.15` TO rt_cases.
    APPEND `6074528981.769|3|6074528981769|60745289817.69` TO rt_cases.
    APPEND `-90064335183.97|2|-9006433518397|-90064335183.97` TO rt_cases.
    APPEND `-696196704.39|3|-696196704390|-6961967043.9` TO rt_cases.
    APPEND `-5164141336862|0|-5164141336862|-51641413368.62` TO rt_cases.
    APPEND `7106646878289|0|7106646878289|71066468782.89` TO rt_cases.
    APPEND `5119715477295|0|5119715477295|51197154772.95` TO rt_cases.
    APPEND `64581855366.06|2|6458185536606|64581855366.06` TO rt_cases.
    APPEND `-16190654687.53|2|-1619065468753|-16190654687.53` TO rt_cases.
    APPEND `-3515599429539|0|-3515599429539|-35155994295.39` TO rt_cases.
    APPEND `5300254704694|0|5300254704694|53002547046.94` TO rt_cases.
    APPEND `7307620109157|0|7307620109157|73076201091.57` TO rt_cases.
    APPEND `82776505774.64|2|8277650577464|82776505774.64` TO rt_cases.
    APPEND `-4725603989417|0|-4725603989417|-47256039894.17` TO rt_cases.
    APPEND `51612817638.12|2|5161281763812|51612817638.12` TO rt_cases.
    APPEND `1948854218722|0|1948854218722|19488542187.22` TO rt_cases.
    APPEND `8315649498415|0|8315649498415|83156494984.15` TO rt_cases.
    APPEND `2184421501011|0|2184421501011|21844215010.11` TO rt_cases.
    APPEND `7118910612715|0|7118910612715|71189106127.15` TO rt_cases.
    APPEND `-622132847326|0|-622132847326|-6221328473.26` TO rt_cases.
    APPEND `-5060823559.251|3|-5060823559251|-50608235592.51` TO rt_cases.
    APPEND `-3312886629.124|3|-3312886629124|-33128866291.24` TO rt_cases.
    APPEND `-9672629472837|0|-9672629472837|-96726294728.37` TO rt_cases.
    APPEND `-4090297938.13|3|-4090297938130|-40902979381.3` TO rt_cases.
    APPEND `67725316575.21|2|6772531657521|67725316575.21` TO rt_cases.
    APPEND `8845748561.97|3|8845748561970|88457485619.7` TO rt_cases.
    APPEND `6014668558.124|3|6014668558124|60146685581.24` TO rt_cases.
    APPEND `-3776526311.904|3|-3776526311904|-37765263119.04` TO rt_cases.
    APPEND `-81994009133.19|2|-8199400913319|-81994009133.19` TO rt_cases.
    APPEND `8802350571.604|3|8802350571604|88023505716.04` TO rt_cases.
    APPEND `50673535985.64|2|5067353598564|50673535985.64` TO rt_cases.
    APPEND `-5195085106.256|3|-5195085106256|-51950851062.56` TO rt_cases.
    APPEND `-1722482823942|0|-1722482823942|-17224828239.42` TO rt_cases.
    APPEND `-3641675126524|0|-3641675126524|-36416751265.24` TO rt_cases.
    APPEND `-3749091119283|0|-3749091119283|-37490911192.83` TO rt_cases.
    APPEND `97122412707.15|2|9712241270715|97122412707.15` TO rt_cases.
    APPEND `-3592323424990|0|-3592323424990|-35923234249.9` TO rt_cases.
    APPEND `26001845132.71|2|2600184513271|26001845132.71` TO rt_cases.
    APPEND `-97284575944.24|2|-9728457594424|-97284575944.24` TO rt_cases.
    APPEND `57194083996.84|2|5719408399684|57194083996.84` TO rt_cases.
    APPEND `-92868603473.5|2|-9286860347350|-92868603473.5` TO rt_cases.
    APPEND `-8590628276028|0|-8590628276028|-85906282760.28` TO rt_cases.
    APPEND `2424127847.694|3|2424127847694|24241278476.94` TO rt_cases.
    APPEND `55298880531.56|2|5529888053156|55298880531.56` TO rt_cases.
    APPEND `2943648606182|0|2943648606182|29436486061.82` TO rt_cases.
    APPEND `-49836705261.93|2|-4983670526193|-49836705261.93` TO rt_cases.
    APPEND `1299795641.882|3|1299795641882|12997956418.82` TO rt_cases.
    APPEND `-8670135423.429|3|-8670135423429|-86701354234.29` TO rt_cases.
    APPEND `8939239681.426|3|8939239681426|89392396814.26` TO rt_cases.
    APPEND `48829717431.61|2|4882971743161|48829717431.61` TO rt_cases.
    APPEND `-6554218914723|0|-6554218914723|-65542189147.23` TO rt_cases.
    APPEND `47854392041.39|2|4785439204139|47854392041.39` TO rt_cases.
    APPEND `-78677463651.45|2|-7867746365145|-78677463651.45` TO rt_cases.
    APPEND `-156435352289|0|-156435352289|-1564353522.89` TO rt_cases.
    APPEND `4288645640673|0|4288645640673|42886456406.73` TO rt_cases.
    APPEND `12236623199.5|2|1223662319950|12236623199.5` TO rt_cases.
    APPEND `3359764183.736|3|3359764183736|33597641837.36` TO rt_cases.
    APPEND `-7424926480.24|3|-7424926480240|-74249264802.4` TO rt_cases.
    APPEND `-13548094451.26|2|-1354809445126|-13548094451.26` TO rt_cases.
    APPEND `12142224798.64|2|1214222479864|12142224798.64` TO rt_cases.
    APPEND `4313076295753|0|4313076295753|43130762957.53` TO rt_cases.
    APPEND `7583647062447|0|7583647062447|75836470624.47` TO rt_cases.
    APPEND `42305199323.85|2|4230519932385|42305199323.85` TO rt_cases.
    APPEND `-7403755221.1|2|-740375522110|-7403755221.1` TO rt_cases.
    APPEND `-4180726752949|0|-4180726752949|-41807267529.49` TO rt_cases.
    APPEND `-8874639200.979|3|-8874639200979|-88746392009.79` TO rt_cases.
    APPEND `-3072955277.497|3|-3072955277497|-30729552774.97` TO rt_cases.
    APPEND `-1034252670.041|3|-1034252670041|-10342526700.41` TO rt_cases.
    APPEND `-5130074493.4|2|-513007449340|-5130074493.4` TO rt_cases.
    APPEND `23002808940.83|2|2300280894083|23002808940.83` TO rt_cases.
    APPEND `-2536139512.914|3|-2536139512914|-25361395129.14` TO rt_cases.
    APPEND `-9695008195.4|2|-969500819540|-9695008195.4` TO rt_cases.
    APPEND `-50706839823.68|2|-5070683982368|-50706839823.68` TO rt_cases.
    APPEND `8980530241900|0|8980530241900|89805302419` TO rt_cases.
    APPEND `62877928011.96|2|6287792801196|62877928011.96` TO rt_cases.
    APPEND `51764123022.43|2|5176412302243|51764123022.43` TO rt_cases.
    APPEND `-6895867227.081|3|-6895867227081|-68958672270.81` TO rt_cases.
    APPEND `85684381693.53|2|8568438169353|85684381693.53` TO rt_cases.
    APPEND `13920047779.71|2|1392004777971|13920047779.71` TO rt_cases.
    APPEND `-82539168543.69|2|-8253916854369|-82539168543.69` TO rt_cases.
    APPEND `81230510340.75|2|8123051034075|81230510340.75` TO rt_cases.
    APPEND `-7241022433028|0|-7241022433028|-72410224330.28` TO rt_cases.
    APPEND `41747467770.94|2|4174746777094|41747467770.94` TO rt_cases.
    APPEND `8171175356260|0|8171175356260|81711753562.6` TO rt_cases.
    APPEND `8651083188.007|3|8651083188007|86510831880.07` TO rt_cases.
    APPEND `4484841795967|0|4484841795967|44848417959.67` TO rt_cases.
    APPEND `5160023668.762|3|5160023668762|51600236687.62` TO rt_cases.
    APPEND `-3812226521.926|3|-3812226521926|-38122265219.26` TO rt_cases.
    APPEND `541969490259|0|541969490259|5419694902.59` TO rt_cases.
    APPEND `3889004628318|0|3889004628318|38890046283.18` TO rt_cases.
    APPEND `-92322859238.03|2|-9232285923803|-92322859238.03` TO rt_cases.
  ENDMETHOD.

  METHOD minor_cases_03.
    APPEND `-54103940916.26|2|-5410394091626|-54103940916.26` TO rt_cases.
    APPEND `4521196552.414|3|4521196552414|45211965524.14` TO rt_cases.
    APPEND `7261981231138|0|7261981231138|72619812311.38` TO rt_cases.
    APPEND `-4978080586163|0|-4978080586163|-49780805861.63` TO rt_cases.
    APPEND `-6191775731.075|3|-6191775731075|-61917757310.75` TO rt_cases.
    APPEND `-7481644909.863|3|-7481644909863|-74816449098.63` TO rt_cases.
    APPEND `-2392116548.625|3|-2392116548625|-23921165486.25` TO rt_cases.
    APPEND `-7638151985762|0|-7638151985762|-76381519857.62` TO rt_cases.
    APPEND `6311567621240|0|6311567621240|63115676212.4` TO rt_cases.
    APPEND `6045877732667|0|6045877732667|60458777326.67` TO rt_cases.
    APPEND `311542114.07|2|31154211407|311542114.07` TO rt_cases.
    APPEND `-5594763756216|0|-5594763756216|-55947637562.16` TO rt_cases.
    APPEND `71768682738.42|2|7176868273842|71768682738.42` TO rt_cases.
    APPEND `-1403902527.756|3|-1403902527756|-14039025277.56` TO rt_cases.
    APPEND `8283646840113|0|8283646840113|82836468401.13` TO rt_cases.
    APPEND `-75421243797.3|2|-7542124379730|-75421243797.3` TO rt_cases.
    APPEND `-28101303838.88|2|-2810130383888|-28101303838.88` TO rt_cases.
    APPEND `16945697086.5|2|1694569708650|16945697086.5` TO rt_cases.
    APPEND `-44231044991.2|2|-4423104499120|-44231044991.2` TO rt_cases.
    APPEND `4281599547100|0|4281599547100|42815995471` TO rt_cases.
    APPEND `-59090403864.71|2|-5909040386471|-59090403864.71` TO rt_cases.
    APPEND `-7115705338618|0|-7115705338618|-71157053386.18` TO rt_cases.
    APPEND `-683999023.93|3|-683999023930|-6839990239.3` TO rt_cases.
    APPEND `-658257845642|0|-658257845642|-6582578456.42` TO rt_cases.
    APPEND `693081404.382|3|693081404382|6930814043.82` TO rt_cases.
    APPEND `-8047208879.379|3|-8047208879379|-80472088793.79` TO rt_cases.
    APPEND `8814621707705|0|8814621707705|88146217077.05` TO rt_cases.
    APPEND `-7012890253.17|3|-7012890253170|-70128902531.7` TO rt_cases.
    APPEND `3481340975250|0|3481340975250|34813409752.5` TO rt_cases.
    APPEND `-979114132256|0|-979114132256|-9791141322.56` TO rt_cases.
    APPEND `-50422067038.78|2|-5042206703878|-50422067038.78` TO rt_cases.
    APPEND `13579042399.05|2|1357904239905|13579042399.05` TO rt_cases.
    APPEND `90839472487.58|2|9083947248758|90839472487.58` TO rt_cases.
    APPEND `4470890736.742|3|4470890736742|44708907367.42` TO rt_cases.
    APPEND `-1694184056469|0|-1694184056469|-16941840564.69` TO rt_cases.
    APPEND `-11611799757.17|2|-1161179975717|-11611799757.17` TO rt_cases.
    APPEND `3972477057.927|3|3972477057927|39724770579.27` TO rt_cases.
    APPEND `-9570548734.683|3|-9570548734683|-95705487346.83` TO rt_cases.
    APPEND `4944601813560|0|4944601813560|49446018135.6` TO rt_cases.
    APPEND `-2654778557.179|3|-2654778557179|-26547785571.79` TO rt_cases.
    APPEND `-77771567911.21|2|-7777156791121|-77771567911.21` TO rt_cases.
    APPEND `-242867785247|0|-242867785247|-2428677852.47` TO rt_cases.
    APPEND `72600275178.6|2|7260027517860|72600275178.6` TO rt_cases.
    APPEND `9336310293783|0|9336310293783|93363102937.83` TO rt_cases.
    APPEND `-8245899951980|0|-8245899951980|-82458999519.8` TO rt_cases.
    APPEND `6359417825191|0|6359417825191|63594178251.91` TO rt_cases.
    APPEND `-2575400092.194|3|-2575400092194|-25754000921.94` TO rt_cases.
    APPEND `-2432705570.962|3|-2432705570962|-24327055709.62` TO rt_cases.
    APPEND `-1289959595718|0|-1289959595718|-12899595957.18` TO rt_cases.
    APPEND `-4512684620198|0|-4512684620198|-45126846201.98` TO rt_cases.
    APPEND `-5956004188528|0|-5956004188528|-59560041885.28` TO rt_cases.
    APPEND `7223420009507|0|7223420009507|72234200095.07` TO rt_cases.
    APPEND `-9560713513.564|3|-9560713513564|-95607135135.64` TO rt_cases.
    APPEND `7676861832.325|3|7676861832325|76768618323.25` TO rt_cases.
    APPEND `7493136387638|0|7493136387638|74931363876.38` TO rt_cases.
    APPEND `5251071148669|0|5251071148669|52510711486.69` TO rt_cases.
    APPEND `-8247723339479|0|-8247723339479|-82477233394.79` TO rt_cases.
    APPEND `-125422427.173|3|-125422427173|-1254224271.73` TO rt_cases.
    APPEND `7261837231.546|3|7261837231546|72618372315.46` TO rt_cases.
    APPEND `-36078874807.32|2|-3607887480732|-36078874807.32` TO rt_cases.
    APPEND `-16683564787.44|2|-1668356478744|-16683564787.44` TO rt_cases.
    APPEND `-4985835932941|0|-4985835932941|-49858359329.41` TO rt_cases.
    APPEND `8378830375.916|3|8378830375916|83788303759.16` TO rt_cases.
    APPEND `3484039604373|0|3484039604373|34840396043.73` TO rt_cases.
    APPEND `73621633481.28|2|7362163348128|73621633481.28` TO rt_cases.
    APPEND `-6378039497.143|3|-6378039497143|-63780394971.43` TO rt_cases.
    APPEND `-40910251647.7|2|-4091025164770|-40910251647.7` TO rt_cases.
    APPEND `6696343017.147|3|6696343017147|66963430171.47` TO rt_cases.
    APPEND `-9159720433082|0|-9159720433082|-91597204330.82` TO rt_cases.
    APPEND `-1534210704308|0|-1534210704308|-15342107043.08` TO rt_cases.
    APPEND `-9862758277058|0|-9862758277058|-98627582770.58` TO rt_cases.
    APPEND `-9066126420813|0|-9066126420813|-90661264208.13` TO rt_cases.
    APPEND `6569749358411|0|6569749358411|65697493584.11` TO rt_cases.
    APPEND `-673203134841|0|-673203134841|-6732031348.41` TO rt_cases.
    APPEND `-9362911428381|0|-9362911428381|-93629114283.81` TO rt_cases.
    APPEND `53858967062.86|2|5385896706286|53858967062.86` TO rt_cases.
    APPEND `-32624437973.91|2|-3262443797391|-32624437973.91` TO rt_cases.
    APPEND `5573968845.872|3|5573968845872|55739688458.72` TO rt_cases.
    APPEND `-2201772398.201|3|-2201772398201|-22017723982.01` TO rt_cases.
    APPEND `72263567047.02|2|7226356704702|72263567047.02` TO rt_cases.
    APPEND `-89700785581.14|2|-8970078558114|-89700785581.14` TO rt_cases.
    APPEND `-23603058548.83|2|-2360305854883|-23603058548.83` TO rt_cases.
    APPEND `-2863800240.369|3|-2863800240369|-28638002403.69` TO rt_cases.
    APPEND `5961580798.459|3|5961580798459|59615807984.59` TO rt_cases.
    APPEND `-5084131259731|0|-5084131259731|-50841312597.31` TO rt_cases.
    APPEND `-45248231585.08|2|-4524823158508|-45248231585.08` TO rt_cases.
    APPEND `-2186577303.763|3|-2186577303763|-21865773037.63` TO rt_cases.
    APPEND `-9347526576.435|3|-9347526576435|-93475265764.35` TO rt_cases.
    APPEND `-69645435178.36|2|-6964543517836|-69645435178.36` TO rt_cases.
    APPEND `7295722102263|0|7295722102263|72957221022.63` TO rt_cases.
    APPEND `8451135651.881|3|8451135651881|84511356518.81` TO rt_cases.
    APPEND `18366917066.98|2|1836691706698|18366917066.98` TO rt_cases.
    APPEND `2056682383.864|3|2056682383864|20566823838.64` TO rt_cases.
    APPEND `-7884666012.9|3|-7884666012900|-78846660129` TO rt_cases.
    APPEND `-18045167556.84|2|-1804516755684|-18045167556.84` TO rt_cases.
    APPEND `5881800638315|0|5881800638315|58818006383.15` TO rt_cases.
    APPEND `3187504664.332|3|3187504664332|31875046643.32` TO rt_cases.
    APPEND `-65211203314.44|2|-6521120331444|-65211203314.44` TO rt_cases.
    APPEND `8819262393.266|3|8819262393266|88192623932.66` TO rt_cases.
    APPEND `-212777396.48|3|-212777396480|-2127773964.8` TO rt_cases.
  ENDMETHOD.

  METHOD convert_cases_01.
    APPEND `346771|2|2|0.004888799|1|1|1695` TO rt_cases.
    APPEND `28609|3|0|0.007393055|100|1|0` TO rt_cases.
    APPEND `-212443|0|3|0.003332973|10|1|-70807` TO rt_cases.
    APPEND `831871|0|2|0.008040279|1|1|668847` TO rt_cases.
    APPEND `60726|3|2|0.008892152|1|1|54` TO rt_cases.
    APPEND `-512791|0|2|0.00070765|100|1|-363` TO rt_cases.
    APPEND `-38454|0|3|0.004381004|1000|1|-168` TO rt_cases.
    APPEND `-513786|2|3|0.007241399|1|1|-37205` TO rt_cases.
    APPEND `-251387|2|3|0.006475938|100|1|-163` TO rt_cases.
    APPEND `232211|2|0|0.009295261|1|1|22` TO rt_cases.
    APPEND `-196524|0|2|0.000832486|1|1|-16360` TO rt_cases.
    APPEND `414577|3|3|0.009711641|1|1|4026` TO rt_cases.
    APPEND `259823|2|2|0.009907919|1|1|2574` TO rt_cases.
    APPEND `406308|0|3|0.009771849|100|1|39704` TO rt_cases.
    APPEND `-578500|2|0|0.005394669|1|1|-31` TO rt_cases.
    APPEND `429713|2|0|0.009923458|1000|1|0` TO rt_cases.
    APPEND `-433074|0|2|0.001015022|1|1|-43958` TO rt_cases.
    APPEND `460402|0|0|0.002145705|1000|1|1` TO rt_cases.
    APPEND `847121|0|2|0.004904199|10|1|41544` TO rt_cases.
    APPEND `-319469|0|0|0.007971316|1000|1|-3` TO rt_cases.
    APPEND `846034|0|3|0.00881464|1|1|7457485` TO rt_cases.
    APPEND `445229|2|2|0.001931013|1|1|860` TO rt_cases.
    APPEND `244332|3|2|0.004403028|100|1|1` TO rt_cases.
    APPEND `-543944|0|0|0.00550512|1|1|-2994` TO rt_cases.
    APPEND `100564|3|3|0.002907919|1|1|292` TO rt_cases.
    APPEND `-622811|3|3|0.007442612|1|1|-4635` TO rt_cases.
    APPEND `934203|3|2|0.000698916|100|1|1` TO rt_cases.
    APPEND `486086|3|0|0.005687706|10|1|0` TO rt_cases.
    APPEND `-506021|3|2|0.005097135|1|1|-258` TO rt_cases.
    APPEND `-37263|2|3|0.004488624|1000|1|-2` TO rt_cases.
    APPEND `495397|3|0|0.004313009|1|1|2` TO rt_cases.
    APPEND `506983|3|3|0.008717097|100|1|44` TO rt_cases.
    APPEND `-433950|2|0|0.006612705|100|1|0` TO rt_cases.
    APPEND `346686|2|0|0.004429276|100|1|0` TO rt_cases.
    APPEND `-340578|2|3|0.006936543|1|1|-23624` TO rt_cases.
    APPEND `-785639|0|3|0.002738034|10|1|-215111` TO rt_cases.
    APPEND `500495|0|2|0.002900115|1000|1|145` TO rt_cases.
    APPEND `-284828|0|2|0.004463632|1|1|-127137` TO rt_cases.
    APPEND `787979|2|3|0.000833977|1000|1|7` TO rt_cases.
    APPEND `616458|0|3|0.003692612|1|1|2276340` TO rt_cases.
    APPEND `-246566|2|2|0.008866267|1|1|-2186` TO rt_cases.
    APPEND `-496216|0|3|0.003778561|1|1|-1874982` TO rt_cases.
    APPEND `-619209|2|0|0.008275156|1|1|-51` TO rt_cases.
    APPEND `477587|0|2|0.005755433|10|1|27487` TO rt_cases.
    APPEND `-55557|2|3|0.006745613|100|1|-37` TO rt_cases.
    APPEND `403710|2|2|0.005725215|1000|1|2` TO rt_cases.
    APPEND `-450833|0|2|0.006428746|1|1|-289829` TO rt_cases.
    APPEND `-699099|2|0|0.003900329|1|1|-27` TO rt_cases.
    APPEND `347514|0|0|0.006837848|1|1|2376` TO rt_cases.
    APPEND `-503116|2|3|0.008653125|1|1|-43535` TO rt_cases.
    APPEND `197007|0|3|0.004071082|1|1|802032` TO rt_cases.
    APPEND `489350|3|2|0.007991107|100|1|4` TO rt_cases.
    APPEND `-547200|0|0|0.008534963|1000|1|-5` TO rt_cases.
    APPEND `-805984|0|0|0.008814256|1|100|-710415` TO rt_cases.
    APPEND `-534144|3|0|0.009178052|1000|100|0` TO rt_cases.
    APPEND `183528|2|2|0.002971135|100|100|545` TO rt_cases.
    APPEND `868265|0|0|0.005758143|1000|100|500` TO rt_cases.
    APPEND `-359396|2|2|0.000890547|1000|1|0` TO rt_cases.
    APPEND `785946|0|3|0.008721605|100|1|68547` TO rt_cases.
    APPEND `748718|3|0|0.006945508|100|1|0` TO rt_cases.
    APPEND `441306|3|3|0.003933124|10|1|174` TO rt_cases.
    APPEND `-588509|3|0|0.009916782|1|1|-6` TO rt_cases.
    APPEND `-965031|0|3|0.007992242|10|1|-771276` TO rt_cases.
    APPEND `-141921|0|3|0.005794031|1|1|-822295` TO rt_cases.
    APPEND `-373541|2|0|0.003605803|1000|100|-1` TO rt_cases.
    APPEND `383383|2|3|0.008898572|1000|1|34` TO rt_cases.
    APPEND `409175|3|3|0.007901628|1|1|3233` TO rt_cases.
    APPEND `447539|0|3|0.006548686|10|1|293079` TO rt_cases.
    APPEND `741210|2|0|0.002094768|1|100|1553` TO rt_cases.
    APPEND `-330105|0|2|0.009030993|1000|1|-298` TO rt_cases.
    APPEND `-91812|2|0|0.0020771|100|1|0` TO rt_cases.
    APPEND `48255|3|2|0.006102411|1|1|29` TO rt_cases.
    APPEND `-979806|0|3|0.007072151|1|1|-6929336` TO rt_cases.
    APPEND `575351|3|0|0.005516075|100|1|0` TO rt_cases.
    APPEND `-360396|3|2|0.00157745|10|1|-6` TO rt_cases.
    APPEND `-544603|3|0|0.004079397|1|1|-2` TO rt_cases.
    APPEND `-190067|2|0|0.009208684|100|1|0` TO rt_cases.
    APPEND `162052|2|2|0.000939878|1|100|15231` TO rt_cases.
    APPEND `766302|3|0|0.000145607|1000|1|0` TO rt_cases.
    APPEND `744707|3|3|0.006697753|10|1|499` TO rt_cases.
    APPEND `71434|0|2|0.006426369|10|1|4591` TO rt_cases.
    APPEND `-646843|0|3|0.004177747|10|1|-270235` TO rt_cases.
    APPEND `896865|3|0|0.001851399|1000|100|0` TO rt_cases.
    APPEND `618276|0|0|0.002070696|1|1|1280` TO rt_cases.
    APPEND `667375|0|0|0.007139704|1000|100|476` TO rt_cases.
    APPEND `909818|2|0|0.000054562|1|1|0` TO rt_cases.
    APPEND `534274|3|3|0.008384081|1000|1|4` TO rt_cases.
    APPEND `-739287|3|0|0.001260431|100|100|-1` TO rt_cases.
    APPEND `-318194|2|2|0.006751875|1|1|-2148` TO rt_cases.
    APPEND `391146|0|2|0.001485296|1|100|5809676` TO rt_cases.
    APPEND `187588|2|0|0.009829861|1000|1|0` TO rt_cases.
    APPEND `-670655|0|3|0.004960454|10|1|-332675` TO rt_cases.
    APPEND `-541889|0|0|0.004533503|1|1|-2457` TO rt_cases.
    APPEND `579708|0|2|0.005635383|1000|1|327` TO rt_cases.
    APPEND `-193542|0|3|0.007886947|1|1|-1526455` TO rt_cases.
    APPEND `-449534|0|2|0.007558649|100|1|-3398` TO rt_cases.
    APPEND `265011|2|0|0.002718387|1|1|7` TO rt_cases.
    APPEND `393820|3|2|0.006054812|1|1|238` TO rt_cases.
    APPEND `28553|2|2|0.001206325|1000|1|0` TO rt_cases.
    APPEND `-445276|2|3|0.00258799|1|1|-11524` TO rt_cases.
  ENDMETHOD.

  METHOD convert_cases_02.
    APPEND `618526|0|0|0.00200463|1|1|1240` TO rt_cases.
    APPEND `-559148|0|0|0.004507164|100|1|-25` TO rt_cases.
    APPEND `-282722|0|2|0.000222485|1|1|-6290` TO rt_cases.
    APPEND `-608668|3|0|0.002061405|10|100|-13` TO rt_cases.
    APPEND `384629|3|3|0.007624312|1|1|2933` TO rt_cases.
    APPEND `-83952|3|0|0.005298278|100|100|0` TO rt_cases.
    APPEND `-142289|0|2|0.005131442|10|100|-730148` TO rt_cases.
    APPEND `218945|2|3|0.008988497|100|1|197` TO rt_cases.
    APPEND `-974239|0|0|0.006541869|1|1|-6373` TO rt_cases.
    APPEND `-723130|2|3|0.001194269|1|1|-8636` TO rt_cases.
    APPEND `-461945|3|0|0.005181541|10|100|-24` TO rt_cases.
    APPEND `330113|0|0|0.007492321|100|1|25` TO rt_cases.
    APPEND `40355|0|0|0.004526331|1000|1|0` TO rt_cases.
    APPEND `-70085|2|2|0.000390632|1|1|-27` TO rt_cases.
    APPEND `963418|2|2|0.0070901|10|1|683` TO rt_cases.
    APPEND `957686|0|2|0.00426548|1|1|408499` TO rt_cases.
    APPEND `712709|3|0|0.009014387|1|100|642` TO rt_cases.
    APPEND `-295766|0|0|0.005177953|10|1|-153` TO rt_cases.
    APPEND `-950803|3|3|0.006868525|1|1|-6531` TO rt_cases.
    APPEND `472710|2|0|0.008169889|1|1|39` TO rt_cases.
    APPEND `898460|2|0|0.00633533|1|100|5692` TO rt_cases.
    APPEND `117775|0|0|0.004796067|1000|100|56` TO rt_cases.
    APPEND `-896753|0|0|0.009963888|1|1|-8935` TO rt_cases.
    APPEND `-18522|0|0|0.00688777|10|1|-13` TO rt_cases.
    APPEND `672634|2|0|0.005339714|10|1|4` TO rt_cases.
    APPEND `978745|0|3|0.001533981|1|1|1501376` TO rt_cases.
    APPEND `77870|2|2|0.00994222|10|1|77` TO rt_cases.
    APPEND `644996|0|0|0.00072604|100|1|5` TO rt_cases.
    APPEND `-803347|2|3|0.008711399|1000|1|-70` TO rt_cases.
    APPEND `727314|3|3|0.009545992|1|1|6943` TO rt_cases.
    APPEND `165223|3|2|0.005569731|1000|1|0` TO rt_cases.
    APPEND `854711|2|3|0.003296043|10|1|2817` TO rt_cases.
    APPEND `564131|0|3|0.00740501|100|1|41774` TO rt_cases.
    APPEND `346241|2|2|0.003241307|1|1|1122` TO rt_cases.
    APPEND `-765369|0|2|0.001024318|10|1|-7840` TO rt_cases.
    APPEND `-540777|2|3|0.008985926|10|1|-4859` TO rt_cases.
    APPEND `-841965|0|0|0.003274413|1|1|-2757` TO rt_cases.
    APPEND `259442|2|2|0.002461593|1|1|639` TO rt_cases.
    APPEND `-468783|0|3|0.009296916|100|1|-43582` TO rt_cases.
    APPEND `-2246|0|2|0.003841175|100|1|-9` TO rt_cases.
    APPEND `80351|2|3|0.003732898|10|1|300` TO rt_cases.
    APPEND `779354|3|0|0.002313393|1000|1|0` TO rt_cases.
    APPEND `568962|3|2|0.003275577|1|1|186` TO rt_cases.
    APPEND `-724283|0|0|0.008483767|1|100|-614465` TO rt_cases.
    APPEND `406560|3|3|0.004983604|1|1|2026` TO rt_cases.
    APPEND `336095|3|0|0.004171047|1|100|140` TO rt_cases.
    APPEND `-433501|0|2|0.008249701|10|1|-35763` TO rt_cases.
    APPEND `-734769|2|3|0.001939311|1|1|-14249` TO rt_cases.
    APPEND `-921926|0|0|0.009090288|1|100|-838057` TO rt_cases.
    APPEND `446208|0|0|0.00780323|100|100|3482` TO rt_cases.
    APPEND `511143|0|2|0.00756142|10|1|38650` TO rt_cases.
    APPEND `769648|2|0|0.000415796|10|100|32` TO rt_cases.
    APPEND `863756|2|0|0.009256207|100|1|1` TO rt_cases.
    APPEND `209949|3|2|0.005929415|100|1|1` TO rt_cases.
    APPEND `117579|3|2|0.000767932|100|1|0` TO rt_cases.
    APPEND `-779712|2|3|0.004725592|1000|1|-37` TO rt_cases.
    APPEND `554204|2|0|0.00522214|100|100|29` TO rt_cases.
    APPEND `-718881|0|2|0.004420612|10|1|-31779` TO rt_cases.
    APPEND `-159386|2|3|0.008023284|1|1|-12788` TO rt_cases.
    APPEND `-233490|0|0|0.009393736|100|1|-22` TO rt_cases.
    APPEND `-89504|2|2|0.009704082|1|100|-86855` TO rt_cases.
    APPEND `503088|2|3|0.002798059|1000|1|14` TO rt_cases.
    APPEND `448004|0|0|0.001645755|10|1|74` TO rt_cases.
    APPEND `791617|0|2|0.007017972|100|1|5556` TO rt_cases.
    APPEND `-464518|3|0|0.007794538|1|1|-4` TO rt_cases.
    APPEND `430147|3|2|0.004491702|100|1|2` TO rt_cases.
    APPEND `-18626|2|0|0.003389759|1|1|-1` TO rt_cases.
    APPEND `-1008|0|0|0.005223278|100|1|0` TO rt_cases.
    APPEND `-554536|0|0|0.008480705|1|1|-4703` TO rt_cases.
    APPEND `-982883|2|0|0.009546467|1|1|-94` TO rt_cases.
    APPEND `615969|3|2|0.006928122|1|1|427` TO rt_cases.
    APPEND `-144662|3|2|0.004111088|1000|100|-6` TO rt_cases.
    APPEND `532051|0|0|0.009385234|1|100|499342` TO rt_cases.
    APPEND `759980|2|3|0.007800728|1|1|59284` TO rt_cases.
    APPEND `138319|3|0|0.002873484|1|100|40` TO rt_cases.
    APPEND `95026|0|0|0.006577687|1|1|625` TO rt_cases.
    APPEND `-43252|0|2|0.002100995|10|1|-909` TO rt_cases.
    APPEND `601736|2|2|0.003925191|10|1|236` TO rt_cases.
    APPEND `-403323|0|3|0.003907559|10|1|-157601` TO rt_cases.
    APPEND `919888|0|0|0.005948889|1|100|547231` TO rt_cases.
    APPEND `495617|3|3|0.001634994|10|1|81` TO rt_cases.
    APPEND `-81454|0|0|0.006888548|10|1|-56` TO rt_cases.
    APPEND `292076|2|0|0.00208668|1000|100|1` TO rt_cases.
    APPEND `206699|0|0|0.006522697|1000|1|1` TO rt_cases.
    APPEND `-562620|0|3|0.007053966|1|1|-3968702` TO rt_cases.
    APPEND `-4835|0|0|0.0023682|1|1|-11` TO rt_cases.
    APPEND `-775449|2|2|0.003300507|1000|1|-3` TO rt_cases.
    APPEND `-21426|2|0|0.008419497|10|100|-18` TO rt_cases.
    APPEND `655807|3|2|0.000980485|100|1|1` TO rt_cases.
    APPEND `-215167|0|0|0.002146203|10|1|-46` TO rt_cases.
    APPEND `61989|0|0|0.009274714|10|100|5749` TO rt_cases.
    APPEND `162427|2|3|0.007295055|1|1|11849` TO rt_cases.
    APPEND `-575210|0|0|0.007498107|100|1|-43` TO rt_cases.
    APPEND `-306157|0|0|0.00042855|1000|1|0` TO rt_cases.
    APPEND `543068|2|2|0.000646263|100|1|4` TO rt_cases.
    APPEND `366895|0|0|0.00526738|1|1|1933` TO rt_cases.
    APPEND `2496|3|2|0.006661717|10|1|0` TO rt_cases.
    APPEND `164774|3|2|0.003920008|1|1|65` TO rt_cases.
    APPEND `111379|2|0|0.008789663|1|1|10` TO rt_cases.
    APPEND `-407378|2|0|0.00940798|1|100|-3833` TO rt_cases.
  ENDMETHOD.

  METHOD convert_cases_03.
    APPEND `467304|2|0|0.000004803|10|1|0` TO rt_cases.
    APPEND `341239|3|3|0.004754173|1|1|1622` TO rt_cases.
    APPEND `-348581|0|2|0.0005176|1|1|-18043` TO rt_cases.
    APPEND `-247733|0|3|0.001344318|1|1|-333032` TO rt_cases.
    APPEND `-177339|3|3|0.00779413|10|1|-138` TO rt_cases.
    APPEND `-448399|3|0|0.00606085|10|100|-27` TO rt_cases.
    APPEND `-60215|3|3|0.007430816|10|1|-45` TO rt_cases.
    APPEND `-174379|0|0|0.00532802|1|1|-929` TO rt_cases.
    APPEND `-259366|3|0|0.001498009|1|1|0` TO rt_cases.
    APPEND `-218813|0|2|0.005260564|1|1|-115108` TO rt_cases.
    APPEND `-366302|0|0|0.007478992|1|100|-273957` TO rt_cases.
    APPEND `943085|2|3|0.006912806|10|1|6519` TO rt_cases.
    APPEND `-162337|0|3|0.002374438|10|1|-38546` TO rt_cases.
    APPEND `52606|0|0|0.008993468|10|1|47` TO rt_cases.
    APPEND `583433|3|0|0.006742561|10|1|0` TO rt_cases.
    APPEND `942311|2|2|0.00622447|1|1|5865` TO rt_cases.
    APPEND `-349471|0|0|0.004965394|1000|1|-2` TO rt_cases.
    APPEND `-811692|3|0|0.000361776|1|1|0` TO rt_cases.
    APPEND `-278972|0|2|0.002248285|10|1|-6272` TO rt_cases.
    APPEND `-47160|3|0|0.005927618|10|100|-3` TO rt_cases.
    APPEND `864663|0|3|0.006063893|1|1|5243224` TO rt_cases.
    APPEND `-184286|0|0|0.0010603|10|1|-20` TO rt_cases.
    APPEND `-47662|3|2|0.000179752|1|100|-86` TO rt_cases.
    APPEND `545608|3|3|0.007118479|10|1|388` TO rt_cases.
    APPEND `-665971|2|0|0.000962412|10|1|-1` TO rt_cases.
    APPEND `-822973|2|2|0.00633177|1000|1|-5` TO rt_cases.
    APPEND `504131|2|0|0.003713652|100|1|0` TO rt_cases.
    APPEND `467976|0|0|0.008450718|10|1|395` TO rt_cases.
    APPEND `-119504|2|0|0.008987941|1|100|-1074` TO rt_cases.
    APPEND `661463|0|3|0.008644764|10|1|571819` TO rt_cases.
    APPEND `-663208|0|2|0.003507641|10|1|-23263` TO rt_cases.
    APPEND `-46164|0|2|0.000179306|1|100|-82775` TO rt_cases.
    APPEND `797163|0|3|0.004320134|10|1|344385` TO rt_cases.
    APPEND `-178658|2|0|0.006408401|1|1|-11` TO rt_cases.
    APPEND `837820|3|2|0.002369986|100|1|2` TO rt_cases.
    APPEND `604080|3|0|0.000586836|10|1|0` TO rt_cases.
    APPEND `-596766|2|2|0.00617898|1|1|-3687` TO rt_cases.
    APPEND `978077|2|2|0.00156674|10|1|153` TO rt_cases.
    APPEND `32255|0|2|0.004382798|10|1|1414` TO rt_cases.
    APPEND `57138|2|0|0.009860545|1000|1|0` TO rt_cases.
    APPEND `-241773|0|0|0.00236484|1|1|-572` TO rt_cases.
    APPEND `530303|3|0|0.006792313|1|100|360` TO rt_cases.
    APPEND `784157|3|3|0.007173375|1|1|5625` TO rt_cases.
    APPEND `-972447|2|3|0.006328677|1|1|-61543` TO rt_cases.
    APPEND `440737|3|2|0.00643195|1|1|283` TO rt_cases.
    APPEND `76428|2|3|0.004809384|1|1|3676` TO rt_cases.
    APPEND `729135|3|2|0.005579459|10|1|41` TO rt_cases.
    APPEND `-331217|0|3|0.002059918|1|1|-682280` TO rt_cases.
    APPEND `-983836|3|3|0.007806432|1|1|-7680` TO rt_cases.
    APPEND `861103|2|0|0.003341424|1|1|29` TO rt_cases.
    APPEND `972880|2|3|0.004351029|1000|1|42` TO rt_cases.
    APPEND `-64782|0|2|0.001587281|100|1|-103` TO rt_cases.
    APPEND `-260549|0|0|0.000469232|1000|1|0` TO rt_cases.
    APPEND `546886|0|2|0.004880283|100|1|2669` TO rt_cases.
    APPEND `-695759|2|0|0.003518659|10|1|-2` TO rt_cases.
    APPEND `457995|0|3|0.009932303|1|1|4548945` TO rt_cases.
    APPEND `200364|3|2|0.005279161|100|1|1` TO rt_cases.
    APPEND `-105842|3|2|0.004098804|10|1|-4` TO rt_cases.
    APPEND `-933569|3|3|0.009273057|1|1|-8657` TO rt_cases.
    APPEND `7149|3|3|0.000438766|10|1|0` TO rt_cases.
    APPEND `-288164|3|0|0.007015967|1000|1|0` TO rt_cases.
    APPEND `-648109|0|0|0.007780258|1000|100|-504` TO rt_cases.
    APPEND `618349|0|3|0.007223744|100|1|44668` TO rt_cases.
    APPEND `-511325|2|0|0.002418421|1|1|-12` TO rt_cases.
    APPEND `-688046|2|3|0.003025613|100|1|-208` TO rt_cases.
    APPEND `-220627|3|3|0.009784652|10|1|-216` TO rt_cases.
    APPEND `104965|2|0|0.006098561|10|1|1` TO rt_cases.
    APPEND `-73250|0|2|0.004074531|1|100|-2984594` TO rt_cases.
    APPEND `-946368|2|0|0.005303672|100|1|-1` TO rt_cases.
    APPEND `-232440|0|2|0.000275089|1|1|-6394` TO rt_cases.
    APPEND `315832|0|3|0.00639657|1|1|2020241` TO rt_cases.
    APPEND `-698767|3|2|0.002562865|100|1|-2` TO rt_cases.
    APPEND `-129009|3|3|0.00015394|10|1|-2` TO rt_cases.
    APPEND `-1878|0|2|0.000713976|10|1|-13` TO rt_cases.
    APPEND `471280|3|3|0.004180738|1|1|1970` TO rt_cases.
    APPEND `-498158|0|3|0.007800786|1|1|-3886024` TO rt_cases.
    APPEND `709592|2|3|0.003616171|10|1|2566` TO rt_cases.
    APPEND `325838|0|2|0.00094581|1|1|30818` TO rt_cases.
    APPEND `138433|2|0|0.004501578|100|1|0` TO rt_cases.
    APPEND `-284750|0|2|0.004044045|1000|1|-115` TO rt_cases.
    APPEND `-747021|0|3|0.005529893|10|1|-413095` TO rt_cases.
    APPEND `-66884|3|2|0.00559592|1|1|-37` TO rt_cases.
    APPEND `213119|0|2|0.009846381|1|1|209845` TO rt_cases.
    APPEND `174635|3|3|0.004524952|1000|1|1` TO rt_cases.
    APPEND `249964|3|3|0.009747167|1|1|2436` TO rt_cases.
    APPEND `-736903|0|3|0.006872326|100|1|-50642` TO rt_cases.
    APPEND `404819|3|0|0.006389504|100|1|0` TO rt_cases.
    APPEND `162553|0|3|0.005958828|100|1|9686` TO rt_cases.
    APPEND `-214962|0|0|0.005649248|1000|100|-121` TO rt_cases.
    APPEND `809083|2|0|0.001672438|10|1|1` TO rt_cases.
    APPEND `371082|2|0|0.000199931|100|100|1` TO rt_cases.
    APPEND `-566545|2|0|0.008954982|100|1|-1` TO rt_cases.
    APPEND `-156386|2|0|0.003718765|10|1|-1` TO rt_cases.
    APPEND `-656734|0|3|0.0090674|1|1|-5954870` TO rt_cases.
    APPEND `645355|3|2|0.005189304|1000|1|0` TO rt_cases.
    APPEND `4075|3|0|0.004211694|1000|1|0` TO rt_cases.
    APPEND `-2217|0|3|0.006442812|100|1|-143` TO rt_cases.
    APPEND `994229|3|0|0.009382061|10|1|1` TO rt_cases.
    APPEND `-777349|3|3|0.006637949|1|1|-5160` TO rt_cases.
    APPEND `-425417|2|3|0.002016039|100|1|-86` TO rt_cases.
  ENDMETHOD.

  METHOD convert_cases_04.
    APPEND `484224|0|0|0.008684684|1000|100|421` TO rt_cases.
    APPEND `401549|0|0|0.004054675|100|1|16` TO rt_cases.
    APPEND `-46246|3|0|0.008553182|1|100|-40` TO rt_cases.
    APPEND `-871069|2|3|0.006157313|1|1|-53634` TO rt_cases.
    APPEND `-167422|3|3|0.000875842|1|1|-147` TO rt_cases.
    APPEND `143823|0|2|0.003470221|1|100|4990976` TO rt_cases.
    APPEND `387649|0|2|0.00332653|1|1|128953` TO rt_cases.
    APPEND `-166|2|3|0.005296296|1000|1|0` TO rt_cases.
    APPEND `-780878|3|2|0.004984744|1|1|-389` TO rt_cases.
    APPEND `-646748|0|0|0.00701316|100|1|-45` TO rt_cases.
    APPEND `-441850|0|0|0.001015531|100|100|-449` TO rt_cases.
    APPEND `558073|3|2|0.009287317|1|1|518` TO rt_cases.
    APPEND `190310|3|0|0.007337146|10|1|0` TO rt_cases.
    APPEND `-764801|3|0|0.002645396|10|1|0` TO rt_cases.
    APPEND `-392902|0|3|0.006451445|1000|1|-2535` TO rt_cases.
    APPEND `-279500|2|0|0.002243329|10|1|-1` TO rt_cases.
    APPEND `-248281|2|0|0.00548484|1|1|-14` TO rt_cases.
    APPEND `-592555|0|2|0.005169039|100|1|-3063` TO rt_cases.
    APPEND `287324|3|0|0.000065774|1|1|0` TO rt_cases.
    APPEND `696537|2|2|0.008622692|100|1|60` TO rt_cases.
    APPEND `-666359|2|2|0.007767919|100|1|-52` TO rt_cases.
    APPEND `172826|0|3|0.007683392|1000|1|1328` TO rt_cases.
    APPEND `-945607|0|0|0.008499111|1|1|-8037` TO rt_cases.
    APPEND `900004|2|0|0.008070132|10|1|7` TO rt_cases.
    APPEND `-836938|3|2|0.008696466|10|1|-73` TO rt_cases.
    APPEND `-748404|3|0|0.000283718|1|1|0` TO rt_cases.
    APPEND `-938853|2|2|0.003419321|1|1|-3210` TO rt_cases.
    APPEND `-806438|0|3|0.00483481|1000|1|-3899` TO rt_cases.
    APPEND `-740054|2|3|0.005684302|100|1|-421` TO rt_cases.
    APPEND `561674|3|0|0.003383693|1000|1|0` TO rt_cases.
    APPEND `346946|3|3|0.008509521|1000|1|3` TO rt_cases.
    APPEND `-933525|3|2|0.006130033|100|1|-6` TO rt_cases.
    APPEND `248858|2|2|0.000513396|1|100|12776` TO rt_cases.
    APPEND `-760120|0|3|0.005224063|10|1|-397091` TO rt_cases.
    APPEND `828416|2|0|0.009671525|1|1|80` TO rt_cases.
    APPEND `620953|3|3|0.001737719|1|1|1079` TO rt_cases.
    APPEND `309792|3|0|0.009528262|1000|100|0` TO rt_cases.
    APPEND `839454|3|0|0.007946384|1000|100|1` TO rt_cases.
    APPEND `376699|0|3|0.007246699|1|1|2729824` TO rt_cases.
    APPEND `-61211|2|0|0.002692527|1|1|-2` TO rt_cases.
    APPEND `353304|0|2|0.00697345|10|1|24637` TO rt_cases.
    APPEND `-316455|2|3|0.002798131|1000|1|-9` TO rt_cases.
    APPEND `-206689|0|0|0.006233946|1|1|-1288` TO rt_cases.
    APPEND `114967|2|3|0.007310523|1000|1|8` TO rt_cases.
    APPEND `251686|2|0|0.009507895|1|1|24` TO rt_cases.
    APPEND `-657382|2|3|0.00770001|100|1|-506` TO rt_cases.
    APPEND `369600|0|3|0.009149957|100|1|33818` TO rt_cases.
    APPEND `184292|0|0|0.003343703|1|1|616` TO rt_cases.
    APPEND `122506|3|3|0.003579998|100|1|4` TO rt_cases.
    APPEND `951439|3|3|0.000815019|100|1|8` TO rt_cases.
    APPEND `-430421|2|3|0.007517008|1000|1|-32` TO rt_cases.
    APPEND `-327097|0|0|0.004120339|1|1|-1348` TO rt_cases.
    APPEND `136789|2|2|0.006382149|1|100|87301` TO rt_cases.
    APPEND `-195220|0|0|0.003867729|1|100|-75506` TO rt_cases.
    APPEND `615274|3|3|0.007512411|100|1|46` TO rt_cases.
    APPEND `854055|3|0|0.000069941|100|100|0` TO rt_cases.
    APPEND `-878716|0|0|0.007118428|1000|1|-6` TO rt_cases.
    APPEND `-538126|0|0|0.000330091|1000|100|-18` TO rt_cases.
    APPEND `489305|2|2|0.004753318|10|1|233` TO rt_cases.
    APPEND `97336|2|3|0.007977173|100|1|78` TO rt_cases.
    APPEND `643107|2|2|0.000112883|10|1|7` TO rt_cases.
    APPEND `139728|2|3|0.000215324|1|1|301` TO rt_cases.
    APPEND `513580|0|3|0.005438841|1|1|2793280` TO rt_cases.
    APPEND `423231|3|0|0.009698732|10|1|0` TO rt_cases.
    APPEND `524797|3|3|0.007472357|1|1|3921` TO rt_cases.
    APPEND `-14914|2|0|0.006857477|1000|1|0` TO rt_cases.
    APPEND `6647|2|2|0.009662651|10|1|6` TO rt_cases.
    APPEND `-929437|0|3|0.006835814|10|1|-635346` TO rt_cases.
    APPEND `-416566|0|3|0.009007214|1000|1|-3752` TO rt_cases.
    APPEND `-847118|0|3|0.008059373|1|1|-6827240` TO rt_cases.
    APPEND `-760025|2|0|0.000244335|1000|1|0` TO rt_cases.
    APPEND `753711|0|2|0.000832695|1000|100|6276` TO rt_cases.
    APPEND `681828|3|0|0.006068321|1|1|4` TO rt_cases.
    APPEND `-812828|3|3|0.004997151|10|1|-406` TO rt_cases.
    APPEND `-225415|0|0|0.007920436|1|100|-178539` TO rt_cases.
    APPEND `-541554|0|3|0.007193583|1000|1|-3896` TO rt_cases.
    APPEND `-442732|2|0|0.007227645|1|100|-3200` TO rt_cases.
    APPEND `-892277|0|0|0.008372063|1000|100|-747` TO rt_cases.
    APPEND `-839423|3|0|0.00528625|100|100|-4` TO rt_cases.
    APPEND `-55044|0|0|0.009060457|10|1|-50` TO rt_cases.
    APPEND `-911058|0|0|0.003312348|1|1|-3018` TO rt_cases.
    APPEND `-850701|3|3|0.008242755|10|1|-701` TO rt_cases.
    APPEND `912554|0|3|0.006336697|1|1|5782578` TO rt_cases.
    APPEND `-979439|2|0|0.009035528|1|100|-8850` TO rt_cases.
    APPEND `448893|0|0|0.002003299|10|1|90` TO rt_cases.
    APPEND `793115|3|3|0.004174161|10|1|331` TO rt_cases.
    APPEND `162121|2|2|0.004217195|1|1|684` TO rt_cases.
    APPEND `314611|0|2|0.002202393|10|100|692897` TO rt_cases.
    APPEND `-198056|3|2|0.000194287|1|100|-385` TO rt_cases.
    APPEND `590643|2|2|0.00290134|100|1|17` TO rt_cases.
    APPEND `636229|0|2|0.005915834|1|1|376383` TO rt_cases.
    APPEND `-319048|0|2|0.001654083|10|1|-5277` TO rt_cases.
    APPEND `-938157|0|2|0.00128296|1|1|-120362` TO rt_cases.
    APPEND `-307429|0|3|0.005904639|1000|1|-1815` TO rt_cases.
    APPEND `-291291|2|0|0.008091602|10|100|-236` TO rt_cases.
    APPEND `812330|3|0|0.003699365|1000|100|0` TO rt_cases.
    APPEND `503323|2|2|0.005212679|100|1|26` TO rt_cases.
    APPEND `564251|0|3|0.006077898|100|1|34295` TO rt_cases.
    APPEND `-173324|2|2|0.001299638|1000|1|0` TO rt_cases.
    APPEND `899823|2|0|0.00485041|1|1|44` TO rt_cases.
  ENDMETHOD.

ENDCLASS.


"! Intermediate values at or above 2^53. Exact on an ABAP kernel (packed arithmetic to 31 digits);
"! the open-abap emulator computes these in float64, so this class carries data only for kernel runs.
CLASS ltc_money_kernel DEFINITION FINAL FOR TESTING
  DURATION SHORT
  RISK LEVEL HARMLESS.

  PRIVATE SECTION.
    METHODS large_magnitude_convert FOR TESTING RAISING cx_static_check.
    METHODS kernel_cases_01 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS kernel_cases_02 RETURNING VALUE(rt_cases) TYPE string_table.
    METHODS kernel_cases_03 RETURNING VALUE(rt_cases) TYPE string_table.
ENDCLASS.


CLASS ltc_money_kernel IMPLEMENTATION.

  METHOD large_magnitude_convert.
    DATA lt_cases TYPE string_table.
    DATA lv_failed TYPE i.
    DATA lv_first TYPE string.
    APPEND LINES OF kernel_cases_01( ) TO lt_cases.
    APPEND LINES OF kernel_cases_02( ) TO lt_cases.
    APPEND LINES OF kernel_cases_03( ) TO lt_cases.
    LOOP AT lt_cases INTO DATA(lv_case).
      SPLIT lv_case AT `|` INTO DATA(lv_minor) DATA(lv_ds) DATA(lv_dt) DATA(lv_rate) DATA(lv_ff) DATA(lv_tf) DATA(lv_exp).
      DATA(lv_got) = zcl_pln_money=>convert(
        iv_minor           = CONV #( lv_minor )
        iv_source_decimals = CONV #( lv_ds )
        iv_target_decimals = CONV #( lv_dt )
        is_rate            = VALUE #( rate = CONV #( lv_rate ) from_factor = CONV #( lv_ff ) to_factor = CONV #( lv_tf ) ) ).
      IF lv_got <> CONV zcl_pln_money=>ty_minor( lv_exp ).
        lv_failed = lv_failed + 1.
        IF lv_first IS INITIAL.
          lv_first = |{ lv_case } got { lv_got }|.
        ENDIF.
      ENDIF.
    ENDLOOP.
    cl_abap_unit_assert=>assert_equals( act = lv_failed exp = 0 msg = |{ lines( lt_cases ) } cases; first: { lv_first }| ).
  ENDMETHOD.

  METHOD kernel_cases_01.
    APPEND `94290|2|3|0.00393125|1000|100|371` TO rt_cases.
    APPEND `-724825|0|3|0.006591295|100|100|-4777535` TO rt_cases.
    APPEND `97819|3|2|0.009578901|1|100|9370` TO rt_cases.
    APPEND `-186579|0|3|0.000881074|1000|100|-16439` TO rt_cases.
    APPEND `-916523|3|2|0.007516055|100|100|-689` TO rt_cases.
    APPEND `344919|2|2|0.007677539|100|100|2648` TO rt_cases.
    APPEND `-992897|3|2|0.008066357|100|100|-801` TO rt_cases.
    APPEND `-405902|3|3|0.001321284|100|100|-536` TO rt_cases.
    APPEND `173599|3|3|0.008789029|1000|100|153` TO rt_cases.
    APPEND `551350|2|3|0.005361106|1|100|2955846` TO rt_cases.
    APPEND `-463842|2|3|0.001178177|10|100|-54649` TO rt_cases.
    APPEND `-695081|0|2|0.004761588|100|100|-330969` TO rt_cases.
    APPEND `225793|0|2|0.00514953|1000|100|11627` TO rt_cases.
    APPEND `193886|0|3|0.004130349|1000|100|80082` TO rt_cases.
    APPEND `889014|0|3|0.009883855|1000|100|878689` TO rt_cases.
    APPEND `-321456|0|2|0.008486128|1000|100|-27279` TO rt_cases.
    APPEND `-765337|2|3|0.00940134|1|100|-7195193` TO rt_cases.
    APPEND `949383|3|3|0.009890142|1|100|938953` TO rt_cases.
    APPEND `-967875|0|2|0.006457086|10|100|-6249652` TO rt_cases.
    APPEND `-351138|2|3|0.008253711|1|100|-2898192` TO rt_cases.
    APPEND `920535|3|3|0.005824044|1|100|536124` TO rt_cases.
    APPEND `100536|0|2|0.009036307|1|100|9084742` TO rt_cases.
    APPEND `103361|0|3|0.002764057|1000|100|28570` TO rt_cases.
    APPEND `764405|3|3|0.008992722|1|100|687408` TO rt_cases.
    APPEND `-660254|3|2|0.008424869|1000|100|-56` TO rt_cases.
    APPEND `857889|0|3|0.007267735|1000|100|623491` TO rt_cases.
    APPEND `-238971|0|3|0.009724347|100|100|-2323837` TO rt_cases.
    APPEND `748962|0|3|0.003151862|1|100|236062487` TO rt_cases.
    APPEND `379148|3|3|0.008035763|1000|100|305` TO rt_cases.
    APPEND `-931588|2|3|0.006181033|10|100|-575818` TO rt_cases.
    APPEND `-413966|0|3|0.00932353|1|100|-385962442` TO rt_cases.
    APPEND `848031|0|2|0.006255221|1|100|53046213` TO rt_cases.
    APPEND `957066|3|3|0.000166772|100|100|160` TO rt_cases.
    APPEND `528638|3|3|0.000995646|100|100|526` TO rt_cases.
    APPEND `322516|0|2|0.006303154|100|100|203287` TO rt_cases.
    APPEND `498347|3|3|0.001894502|100|100|944` TO rt_cases.
    APPEND `912633|0|3|0.007543737|100|100|6884663` TO rt_cases.
    APPEND `740267|3|3|0.003482247|100|100|2578` TO rt_cases.
    APPEND `-457082|2|3|0.002673083|1|100|-1221818` TO rt_cases.
    APPEND `519578|0|2|0.005569954|10|100|2894026` TO rt_cases.
    APPEND `420827|0|2|0.005723162|1|100|24084611` TO rt_cases.
    APPEND `-271900|3|2|0.008661375|1|100|-23550` TO rt_cases.
    APPEND `-499997|3|3|0.001912387|100|100|-956` TO rt_cases.
    APPEND `-403615|0|3|0.003814072|1|100|-153941667` TO rt_cases.
    APPEND `-815515|0|3|0.005286273|1000|100|-431103` TO rt_cases.
    APPEND `-486768|0|2|0.008960503|100|100|-436169` TO rt_cases.
    APPEND `-110896|3|3|0.001912266|1000|100|-21` TO rt_cases.
    APPEND `559589|0|3|0.007748392|1|100|433591493` TO rt_cases.
    APPEND `-766763|2|2|0.005477331|1|100|-419981` TO rt_cases.
    APPEND `957538|2|3|0.000738576|1000|100|707` TO rt_cases.
    APPEND `-392345|3|3|0.001161038|1|100|-45553` TO rt_cases.
    APPEND `387314|0|3|0.007305601|1|100|282956155` TO rt_cases.
    APPEND `546349|0|2|0.00362241|1|100|19791001` TO rt_cases.
    APPEND `311594|2|3|0.000660505|100|100|2058` TO rt_cases.
    APPEND `-693657|0|3|0.002878788|1|100|-199689145` TO rt_cases.
    APPEND `772335|0|2|0.002592845|1000|100|20025` TO rt_cases.
    APPEND `853994|2|3|0.006655596|100|100|56838` TO rt_cases.
    APPEND `-433328|0|2|0.004566584|100|100|-197883` TO rt_cases.
    APPEND `318593|0|2|0.004066416|10|100|1295532` TO rt_cases.
    APPEND `-584942|3|2|0.005639023|100|100|-330` TO rt_cases.
    APPEND `-832888|0|2|0.005072971|10|100|-4225217` TO rt_cases.
    APPEND `126049|2|3|0.007268825|1|100|916228` TO rt_cases.
    APPEND `-618707|3|2|0.006565013|1|100|-40618` TO rt_cases.
    APPEND `-933491|2|3|0.003069704|1|100|-2865541` TO rt_cases.
    APPEND `27138|2|3|0.007830998|100|100|2125` TO rt_cases.
    APPEND `753157|3|3|0.007786238|1000|100|586` TO rt_cases.
    APPEND `634339|2|2|0.006877578|1000|100|436` TO rt_cases.
    APPEND `497339|0|3|0.004295581|1|100|213635996` TO rt_cases.
    APPEND `-290509|2|3|0.002584057|1|100|-750692` TO rt_cases.
    APPEND `-96172|3|3|0.006797182|1|100|-65370` TO rt_cases.
    APPEND `-830038|3|2|0.006072127|1000|100|-50` TO rt_cases.
    APPEND `51603|3|3|0.002524219|1|100|13026` TO rt_cases.
    APPEND `-921480|2|2|0.003308496|1|100|-304871` TO rt_cases.
    APPEND `-900556|2|2|0.007866353|10|100|-70841` TO rt_cases.
    APPEND `372351|2|3|0.009176362|100|100|34168` TO rt_cases.
    APPEND `943599|0|3|0.004077629|1000|100|384765` TO rt_cases.
    APPEND `390971|3|3|0.008901608|10|100|34803` TO rt_cases.
    APPEND `-975849|3|2|0.00337798|1|100|-32964` TO rt_cases.
    APPEND `384142|0|3|0.006335707|1|100|243381116` TO rt_cases.
    APPEND `-842569|3|2|0.008425899|1|100|-70994` TO rt_cases.
    APPEND `340120|2|3|0.001879748|100|100|6393` TO rt_cases.
    APPEND `-282061|2|2|0.006991904|1|100|-197214` TO rt_cases.
    APPEND `-609869|2|3|0.007346847|1|100|-4480614` TO rt_cases.
    APPEND `-358963|3|3|0.001134235|100|100|-407` TO rt_cases.
    APPEND `-145673|2|2|0.008644466|1000|100|-126` TO rt_cases.
    APPEND `745824|0|3|0.004913769|1|100|366480685` TO rt_cases.
    APPEND `-225059|3|3|0.005906619|1|100|-132934` TO rt_cases.
    APPEND `-520541|0|2|0.009339116|1|100|-48613928` TO rt_cases.
    APPEND `-220347|0|2|0.004252859|1|100|-9371047` TO rt_cases.
    APPEND `-570400|0|3|0.002998033|100|100|-1710078` TO rt_cases.
    APPEND `-579253|0|3|0.003877476|1|100|-224603961` TO rt_cases.
    APPEND `-288302|2|2|0.00456601|100|100|-1316` TO rt_cases.
    APPEND `-278918|2|3|0.00187399|1|100|-522690` TO rt_cases.
    APPEND `787748|3|3|0.000141777|10|100|1117` TO rt_cases.
    APPEND `55822059514|0|2|1332.627189879|100|1|74389994303400` TO rt_cases.
    APPEND `987305227917|0|3|1124.457275343|1|100|111018254651544943935` TO rt_cases.
    APPEND `402100163619|2|0|1703.186875945|10|100|68485172149122` TO rt_cases.
    APPEND `372863478634|3|0|9532.846131143|1|1|3554450169741` TO rt_cases.
    APPEND `66764717129|3|2|3028.883868691|1|1|20222257470975` TO rt_cases.
    APPEND `-143250801263|3|3|9099.858729621|1000|100|-130356205439831` TO rt_cases.
  ENDMETHOD.

  METHOD kernel_cases_02.
    APPEND `278680903084|2|0|1254.164748483|100|100|3495117647234` TO rt_cases.
    APPEND `-582275366796|3|3|8528.477300534|10|100|-49659222483797948` TO rt_cases.
    APPEND `-880048987285|2|3|1184.986869297|10|1|-1042846494270848` TO rt_cases.
    APPEND `-298138847562|2|2|3906.284775335|1000|1|-1164615241167` TO rt_cases.
    APPEND `-463528772002|3|2|6972.554103147|10|1|-32319794411492` TO rt_cases.
    APPEND `-777084348572|0|2|846.254342551|1|100|-6576110045074699757` TO rt_cases.
    APPEND `389813217358|3|3|7618.895843751|100|100|2969946301568071` TO rt_cases.
    APPEND `252773107513|0|2|3976.725098117|100|1|1005209160775974` TO rt_cases.
    APPEND `293684090440|2|3|9006.380417208|100|1|264503064098436` TO rt_cases.
    APPEND `399850914352|3|2|7919.770094484|1|1|316672731373705` TO rt_cases.
    APPEND `801519257687|0|2|3218.099183802|1000|100|25793684689641196` TO rt_cases.
    APPEND `801532789805|2|0|7796.273508143|1|1|62489688550647` TO rt_cases.
    APPEND `-986476323043|2|0|1694.520980292|10|100|-167160482595767` TO rt_cases.
    APPEND `775518847091|3|3|3850.777883117|1|1|2986350824318417` TO rt_cases.
    APPEND `393650689639|3|0|8754.180413841|10|100|34460891571327` TO rt_cases.
    APPEND `-517287784145|2|2|1371.949169616|100|1|-7096925459102` TO rt_cases.
    APPEND `463191392979|3|3|7985.873136742|100|1|36989877023611` TO rt_cases.
    APPEND `790539299011|0|3|4589.818350454|1|1|3628431781355729494` TO rt_cases.
    APPEND `-582726126142|2|3|2745.164129446|1000|100|-1599678858776043` TO rt_cases.
    APPEND `826619884164|3|3|3799.258972777|1|1|3140543011985961` TO rt_cases.
    APPEND `-198314754624|3|2|229.401258331|100|100|-4549365425635` TO rt_cases.
    APPEND `101628860769|0|2|2651.801627153|1|1|26949957835293989` TO rt_cases.
    APPEND `174694598262|0|0|1887.260979609|1|1|329694298648343` TO rt_cases.
    APPEND `-264777559340|0|2|9253.482452918|1|1|-245011449927914450` TO rt_cases.
    APPEND `992529185468|0|3|2216.360527081|10|1|219980250864713209` TO rt_cases.
    APPEND `-433206089353|0|3|5756.204690049|1|1|-2493622923291524764` TO rt_cases.
    APPEND `-276310822171|2|2|9994.361342343|10|100|-27615501995768535` TO rt_cases.
    APPEND `184296388644|3|0|1934.05681475|1|1|356439686391` TO rt_cases.
    APPEND `-584003513253|3|3|9904.119774175|1000|1|-5784040743797` TO rt_cases.
    APPEND `-40060831746|3|3|2241.422950028|1000|100|-8979326767269` TO rt_cases.
    APPEND `-344783971371|2|3|8641.294546821|1|1|-29793798516395101` TO rt_cases.
    APPEND `271836447292|2|0|8516.641804655|10|1|2315133651036` TO rt_cases.
    APPEND `-527438142554|3|0|2126.9764413|100|1|-11218485035` TO rt_cases.
    APPEND `-393296301206|3|0|7270.546612698|1000|100|-285947909052` TO rt_cases.
    APPEND `-65785077111|0|2|4794.906234828|1000|1|-31543327639817` TO rt_cases.
    APPEND `515441311008|3|2|6317.880290666|100|100|325649649981249` TO rt_cases.
    APPEND `284120460081|2|2|3188.803138849|1000|1|906004214918` TO rt_cases.
    APPEND `-641596226365|3|0|3344.137740601|100|100|-2145586154814` TO rt_cases.
    APPEND `755557550528|2|0|6243.412510219|10|1|4717257463157` TO rt_cases.
    APPEND `-570300433209|2|0|8735.180620514|1000|100|-4981677292038` TO rt_cases.
    APPEND `-293363464301|0|3|1268.505790702|1|1|-372133253246217955` TO rt_cases.
    APPEND `-179158725743|0|2|2581.026271183|1|1|-46241337785435304` TO rt_cases.
    APPEND `917176439446|3|0|3786.277774352|100|1|34726847678` TO rt_cases.
    APPEND `707435127560|2|3|795.746351317|100|1|56293892154935` TO rt_cases.
    APPEND `-43870356441|2|0|6038.479407355|1000|1|-2649102440` TO rt_cases.
    APPEND `844839931556|2|2|7756.890629084|100|100|6553330948162704` TO rt_cases.
    APPEND `706011239233|3|0|8615.025766356|1|1|6082305017329` TO rt_cases.
    APPEND `-465417136048|2|2|2372.94982787|1000|1|-1104411512873` TO rt_cases.
    APPEND `840512087249|3|2|9421.728369467|10|1|79190765773138` TO rt_cases.
    APPEND `-226953420847|3|2|8252.958161134|10|1|-18730370867765` TO rt_cases.
    APPEND `-559303629085|3|2|9162.785759696|1|1|-512477932792633` TO rt_cases.
    APPEND `799458815731|0|0|6724.003677268|1|1|5375564016799564` TO rt_cases.
    APPEND `525039965428|3|3|9612.805903594|1|1|5047107279289068` TO rt_cases.
    APPEND `735824033500|3|0|849.942424257|1|100|62540806285955` TO rt_cases.
    APPEND `931478214748|3|3|2654.546405701|1000|100|247265214694809` TO rt_cases.
    APPEND `296202604484|3|3|3903.746993635|1|1|1156300026761272` TO rt_cases.
    APPEND `-257401344029|0|3|2636.114006412|1|1|-678539288264120724` TO rt_cases.
    APPEND `49674656828|3|3|1319.488955874|100|100|65545161071377` TO rt_cases.
    APPEND `-425100907933|3|3|6835.392000465|1|1|-2905731345475637` TO rt_cases.
    APPEND `61696673472|0|2|957.907064243|1|1|5909967935912250` TO rt_cases.
    APPEND `-232874322661|2|2|5107.14780079|1|1|-1189323584838587` TO rt_cases.
    APPEND `129677803683|0|3|981.82998508|1|100|12732155605528705905` TO rt_cases.
    APPEND `-425534039901|0|3|6728.220116185|10|100|-28630866873833786459` TO rt_cases.
    APPEND `883615335800|0|2|6583.934341442|100|1|5817665353998425` TO rt_cases.
    APPEND `241362818128|0|0|2240.668648819|1|1|540814099570012` TO rt_cases.
    APPEND `-874533605821|3|0|4345.983070126|1000|1|-3800708245` TO rt_cases.
    APPEND `659315689737|0|2|6234.771849911|100|100|411068290257690241` TO rt_cases.
    APPEND `-943549677057|3|0|5820.438698423|1|1|-5491873054227` TO rt_cases.
    APPEND `-579043770535|2|0|7205.605521161|100|100|-41723609899609` TO rt_cases.
    APPEND `-995061118247|0|0|3091.303950599|10|1|-307603636592441` TO rt_cases.
    APPEND `673253472123|3|0|5044.66840993|10|100|33963405226946` TO rt_cases.
    APPEND `-460326952812|2|3|1302.747356469|10|1|-599689720887263` TO rt_cases.
    APPEND `370286278815|3|0|9937.556895161|1|1|3679740963222` TO rt_cases.
    APPEND `-377650962574|2|3|5096.069473782|100|100|-19245355421177500` TO rt_cases.
    APPEND `35265840358|0|0|4264.100797745|100|100|150377098003696` TO rt_cases.
    APPEND `-420699608363|3|2|2644.277796301|1|1|-111244663330681` TO rt_cases.
    APPEND `-987415309037|3|2|9998.264846352|100|100|-987243977309443` TO rt_cases.
    APPEND `15374005864|3|3|5442.576278785|1|1|83674199625308` TO rt_cases.
    APPEND `362599505258|3|3|526.738295378|100|100|190995045304505` TO rt_cases.
    APPEND `535425628729|3|3|8226.798463489|1|100|440483873974036898` TO rt_cases.
    APPEND `538627199072|3|0|8427.22017713|1|100|453912999997058` TO rt_cases.
    APPEND `-32263134450|3|2|1112.634902764|1000|100|-358970894616` TO rt_cases.
    APPEND `507475676013|0|2|4757.429203505|10|1|24142796011326880` TO rt_cases.
    APPEND `616836358338|0|3|7106.249663173|1000|1|4383393163672272` TO rt_cases.
    APPEND `468793684823|0|2|1213.807218623|1000|1|56902515868303` TO rt_cases.
    APPEND `-3838423738|0|2|8526.286830002|100|1|-32727501765276` TO rt_cases.
    APPEND `415887408043|3|0|5039.633669768|10|100|20959201844060` TO rt_cases.
    APPEND `-453475336807|0|3|3503.144414652|10|100|-15885895933178765657` TO rt_cases.
    APPEND `169403457476|0|0|5195.891940834|10|100|8802020594489636` TO rt_cases.
    APPEND `-184325763008|0|2|6687.631133275|10|1|-12327027113569701` TO rt_cases.
    APPEND `395436262825|3|3|2154.560431683|1|100|85199132513534425` TO rt_cases.
    APPEND `-274818733415|3|2|128.554208781|100|1|-35329104832` TO rt_cases.
    APPEND `-948862929820|0|2|1794.754859494|1|1|-170297635428815928` TO rt_cases.
    APPEND `-11108638171|0|3|1368.110933369|10|1|-1519784933658531` TO rt_cases.
    APPEND `128110822472|0|2|6104.221012004|1|100|7820167743986966250` TO rt_cases.
    APPEND `971487870154|0|0|4318.392871976|10|1|419526629368418` TO rt_cases.
    APPEND `439151572345|2|2|4689.753248124|100|100|2059512512823726` TO rt_cases.
    APPEND `796658122848|0|0|1277.925296899|10|100|10180695681675304` TO rt_cases.
    APPEND `512872024702|0|0|1750.181358412|1|1|897619056884459` TO rt_cases.
    APPEND `963079513841|2|0|7801.933785342|1000|1|75138825970` TO rt_cases.
  ENDMETHOD.

  METHOD kernel_cases_03.
    APPEND `233298024822|2|2|2449.971062613|10|100|5715734097786694` TO rt_cases.
    APPEND `886421653875|3|2|7483.103314499|1|1|663318481615570` TO rt_cases.
    APPEND `-830440936870|3|0|1054.749495792|1|1|-875907159449` TO rt_cases.
    APPEND `-914482844783|2|2|3377.657998768|10|1|-308881029541742` TO rt_cases.
    APPEND `673034759224|2|3|6934.463985588|10|1|4667135298887719` TO rt_cases.
    APPEND `61752469792|2|3|2400.827454142|1|1|1482570248377081` TO rt_cases.
    APPEND `698658108972|3|0|2643.376895953|10|1|184681670343` TO rt_cases.
    APPEND `-45876396831|2|0|3420.071583629|1|1|-1569005611610` TO rt_cases.
    APPEND `709699069270|0|0|1270.782729295|1|1|901873320225052` TO rt_cases.
    APPEND `620143042957|0|0|7987.368818915|1|1|4953311204581807` TO rt_cases.
    APPEND `15437709981|0|3|552.766702274|10|1|853345203685979` TO rt_cases.
    APPEND `462144571677|3|2|8142.030098181|10|1|37627950123051` TO rt_cases.
    APPEND `128897491332|2|0|1590.875290338|1|1|2050598339466` TO rt_cases.
    APPEND `-421227033735|3|3|5600.804999389|1|1|-2359210476420787` TO rt_cases.
    APPEND `-578391608287|2|2|9107.896260087|10|100|-52679307659828724` TO rt_cases.
    APPEND `-522588882347|2|3|5837.673085049|1|100|-3050703053022920386` TO rt_cases.
    APPEND `93213803700|0|0|638.933098741|1000|1|59557384443` TO rt_cases.
    APPEND `-106565035639|3|2|3118.527325405|100|1|-332325975573` TO rt_cases.
    APPEND `403845555320|0|2|5130.956714446|1000|100|20721140636683275` TO rt_cases.
    APPEND `293085235145|0|0|5770.260620156|1000|1|1691178190706` TO rt_cases.
    APPEND `499283335174|2|2|8608.677895146|10|1|429816941092719` TO rt_cases.
    APPEND `-760633853816|0|0|2419.023765188|1000|1|-1839991368987` TO rt_cases.
    APPEND `-681243889306|2|0|4810.642903198|1|1|-32772210814369` TO rt_cases.
    APPEND `303360262768|3|2|9678.637737818|10|100|2936114087380750` TO rt_cases.
    APPEND `-938264016255|2|0|887.713396395|100|100|-8329095365849` TO rt_cases.
    APPEND `183024278306|0|3|51.859782847|1|100|949159932867805302` TO rt_cases.
    APPEND `746520615427|0|3|7247.001564216|1|100|541003606771895998076` TO rt_cases.
    APPEND `960951167197|2|0|2444.851130403|1000|1|23493825474` TO rt_cases.
    APPEND `667770979768|0|3|7765.294419616|100|100|5185438262773959238` TO rt_cases.
    APPEND `-561981683236|3|0|5755.204287685|1|1|-3234319392960` TO rt_cases.
    APPEND `-739590772148|0|0|8383.212133921|100|1|-62001463352071` TO rt_cases.
    APPEND `11787774461|0|0|7082.218896337|1|1|83483599033453` TO rt_cases.
    APPEND `210407161070|3|0|7959.172017702|1|1|1674666788712` TO rt_cases.
    APPEND `-195957507625|2|0|5191.613010148|1|1|-10173355460221` TO rt_cases.
    APPEND `809043042682|2|0|3333.576037832|1|100|2697006500659407` TO rt_cases.
    APPEND `952367111526|3|2|8711.919445204|1|100|82969455578761259` TO rt_cases.
    APPEND `-110389299365|0|0|6619.787705475|10|100|-7307537267524262` TO rt_cases.
    APPEND `625268629722|0|3|8895.727289513|1000|100|556221921269439469` TO rt_cases.
    APPEND `-957718943896|2|0|2025.252026113|1000|1|-19396222316` TO rt_cases.
    APPEND `-426930599456|0|0|1543.66191102|1|1|-659036505029163` TO rt_cases.
    APPEND `-816318587127|3|0|1812.593798228|1|100|-147965400840464` TO rt_cases.
    APPEND `178455168721|3|2|3473.788608485|100|1|619915532228` TO rt_cases.
    APPEND `516510711982|0|0|7672.73472521|1|1|3963049675767232` TO rt_cases.
    APPEND `798398504527|3|3|4185.978836627|1000|1|3342079243145` TO rt_cases.
    APPEND `765528341352|3|2|1388.542152365|1|1|106296837079731` TO rt_cases.
    APPEND `-828076843812|2|3|8908.124075672|1|1|-73766112688681596` TO rt_cases.
    APPEND `854999179254|0|2|7518.150579495|10|100|6428012574976209482` TO rt_cases.
    APPEND `-417971613759|2|2|9072.175507452|1|1|-3791911837154587` TO rt_cases.
    APPEND `430544459894|3|3|5867.572282617|100|1|25262507393083` TO rt_cases.
    APPEND `-582698036283|2|3|5368.80772156|1|1|-31283937165340194` TO rt_cases.
    APPEND `-164757099879|2|3|9264.73601182|1|1|-15264310364519959` TO rt_cases.
    APPEND `-194614571375|3|2|2231.116815306|100|1|-434207842698` TO rt_cases.
    APPEND `978486594781|2|0|7812.920678243|1|1|76448381497481` TO rt_cases.
    APPEND `-157347011097|2|3|3505.660012609|1000|100|-551605124906297` TO rt_cases.
    APPEND `589978883989|0|0|4116.81493688|10|100|24288338820497079` TO rt_cases.
    APPEND `664756885663|0|2|7854.548102806|1000|100|52213649351115417` TO rt_cases.
    APPEND `-125565334111|0|3|3279.127348081|1|1|-411744721054308160` TO rt_cases.
    APPEND `-845727349391|2|3|7286.378681291|100|1|-616228972878733` TO rt_cases.
    APPEND `-998069047055|0|2|3076.965923246|100|100|-307102444683484349` TO rt_cases.
    APPEND `-571620268584|2|2|262.727616492|10|1|-15018043070359` TO rt_cases.
    APPEND `-796926329518|3|0|5911.844280985|10|1|-471130436353` TO rt_cases.
    APPEND `-844745145721|2|2|3949.293311904|1000|1|-3336146354259` TO rt_cases.
    APPEND `-86962730666|3|2|5071.364897905|100|100|-44101973972552` TO rt_cases.
    APPEND `-540056993120|0|3|5627.093401819|10|1|-303895114259176108` TO rt_cases.
    APPEND `115786748626|3|2|5484.249113946|1|1|63500337355883` TO rt_cases.
    APPEND `8844782972|3|2|8086.278465232|1|100|715213780761343` TO rt_cases.
    APPEND `-412918878328|0|3|2663.835864484|1|1|-1099948117212631493` TO rt_cases.
    APPEND `100697875921|0|3|6641.303972908|1000|1|668765203417534` TO rt_cases.
    APPEND `-142181106571|3|0|71.98764426|100|100|-10235282920` TO rt_cases.
    APPEND `694663279550|3|0|347.741164888|1|1|241563018036` TO rt_cases.
    APPEND `-670719797520|0|2|368.833556259|10|1|-2473839681726180` TO rt_cases.
    APPEND `-252305726534|0|0|8090.77576635|1000|1|-2041349057953` TO rt_cases.
    APPEND `349135821951|3|2|2927.814180365|100|1|1022204810382` TO rt_cases.
    APPEND `318827567496|0|2|7107.983161306|10|1|22662209811217202` TO rt_cases.
    APPEND `-618151655405|3|2|2335.853840015|1000|100|-14439119179894` TO rt_cases.
    APPEND `865460298445|3|2|3670.90263675|100|100|317702049156419` TO rt_cases.
    APPEND `120495112448|2|2|3047.6211561|1|1|367223453903173` TO rt_cases.
    APPEND `404703192811|3|0|7086.045435175|10|1|286774521202` TO rt_cases.
    APPEND `462227336921|2|3|2606.940122884|1000|1|12049989905132` TO rt_cases.
    APPEND `-862792912030|0|2|182.450289339|100|1|-157416816439512` TO rt_cases.
    APPEND `-756612993001|2|2|8780.825592976|1000|100|-664368673292135` TO rt_cases.
    APPEND `271605297541|3|0|636.785675306|10|1|17295436281` TO rt_cases.
    APPEND `430237211646|3|3|9035.897469577|1|1|3887579332029956` TO rt_cases.
    APPEND `-352834210139|3|0|2570.488132128|10|1|-90695614977` TO rt_cases.
    APPEND `-386269712986|0|3|1717.077360594|1000|1|-663254979251403` TO rt_cases.
    APPEND `-109615936782|3|2|3715.579281844|1|1|-40728670366712` TO rt_cases.
    APPEND `-338077346694|2|3|9453.442871495|1|1|-31959948831183380` TO rt_cases.
    APPEND `-16453464880|2|3|4011.188750476|100|1|-6599795323301` TO rt_cases.
    APPEND `-397301850927|3|2|352.429399157|1|100|-1400208526061666` TO rt_cases.
    APPEND `881145137487|2|2|9193.43528844|1|100|810075080121030130` TO rt_cases.
    APPEND `-695164416454|2|0|9088.330108142|1|1|-63178836961679` TO rt_cases.
    APPEND `178136010418|3|0|5172.638874881|1000|1|921433253` TO rt_cases.
    APPEND `367439174284|2|0|2607.735014385|1|100|958184000437099` TO rt_cases.
    APPEND `120549560725|3|0|5155.061785745|1|100|62144043378179` TO rt_cases.
    APPEND `16096551974|0|3|9040.94591497|1|1|145528055814437590` TO rt_cases.
    APPEND `-919106224736|0|3|3979.961274948|100|1|-36580071820129336` TO rt_cases.
    APPEND `-191111794775|2|3|7014.365660645|10|100|-134052801061399453` TO rt_cases.
    APPEND `494261993934|0|0|9438.320177149|10|100|46650029501451688` TO rt_cases.
    APPEND `-81981386143|2|2|7379.147798152|1|100|-60495276504656733` TO rt_cases.
    APPEND `-949836994668|0|0|8080.057295671|100|1|-76747373384654` TO rt_cases.
  ENDMETHOD.

ENDCLASS.

"! Server-side decision for every budget workflow action, applied identically to the UI, uploads,
"! jobs and APIs. Segregation of duties is checked against the user who executes the action
"! (so delegation cannot route an approval back to a preparer); approved data never changes in
"! place; and when no eligible reviewer or approver exists, the guard asks for an audited
"! substitute instead of leaving the budget stuck.
CLASS zcl_pln_workflow_guard DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC.

  PUBLIC SECTION.
    CONSTANTS:
      BEGIN OF status,
        draft     TYPE string VALUE `DRAFT`,
        submitted TYPE string VALUE `SUBMITTED`,
        reviewed  TYPE string VALUE `REVIEWED`,
        approved  TYPE string VALUE `APPROVED`,
        released  TYPE string VALUE `RELEASED`,
        returned  TYPE string VALUE `RETURNED`,
      END OF status.

    CONSTANTS:
      BEGIN OF action,
        edit      TYPE string VALUE `EDIT`,
        submit    TYPE string VALUE `SUBMIT`,
        recommend TYPE string VALUE `RECOMMEND`,
        approve   TYPE string VALUE `APPROVE`,
        reject    TYPE string VALUE `REJECT`,
        release   TYPE string VALUE `RELEASE`,
        amend     TYPE string VALUE `AMEND`,
      END OF action.

    CONSTANTS:
      BEGIN OF role,
        preparer TYPE string VALUE `P`,
        reviewer TYPE string VALUE `R`,
        approver TYPE string VALUE `A`,
        admin    TYPE string VALUE `X`,
      END OF role.

    " Denial reasons: stable codes. The application layer maps each code to a T100 message.
    CONSTANTS:
      BEGIN OF reasons,
        not_preparer               TYPE string VALUE `NOT_PREPARER`,
        locked_for_edit            TYPE string VALUE `LOCKED_FOR_EDIT`,
        not_open                   TYPE string VALUE `NOT_OPEN`,
        no_data                    TYPE string VALUE `NO_DATA`,
        not_reviewer               TYPE string VALUE `NOT_REVIEWER`,
        not_submitted              TYPE string VALUE `NOT_SUBMITTED`,
        reviewer_is_editor         TYPE string VALUE `REVIEWER_IS_EDITOR`,
        no_approval_authority      TYPE string VALUE `NO_APPROVAL_AUTHORITY`,
        not_reviewed               TYPE string VALUE `NOT_REVIEWED`,
        approver_is_editor         TYPE string VALUE `APPROVER_IS_EDITOR`,
        approver_is_recommender    TYPE string VALUE `APPROVER_IS_RECOMMENDER`,
        stale_recommendation       TYPE string VALUE `STALE_RECOMMENDATION`,
        not_reviewer_or_approver   TYPE string VALUE `NOT_REVIEWER_OR_APPROVER`,
        nothing_to_reject          TYPE string VALUE `NOTHING_TO_REJECT`,
        not_admin                  TYPE string VALUE `NOT_ADMIN`,
        not_approved               TYPE string VALUE `NOT_APPROVED`,
        payload_differs            TYPE string VALUE `PAYLOAD_DIFFERS`,
        not_preparer_or_admin      TYPE string VALUE `NOT_PREPARER_OR_ADMIN`,
        not_amendable              TYPE string VALUE `NOT_AMENDABLE`,
        unknown_action             TYPE string VALUE `UNKNOWN_ACTION`,
      END OF reasons.

    TYPES:
      BEGIN OF ty_role_assignment,
        user TYPE string,
        role TYPE string,
      END OF ty_role_assignment,
      tt_role_assignment TYPE STANDARD TABLE OF ty_role_assignment WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_delegation,
        from_user TYPE string,
        to_user   TYPE string,
      END OF ty_delegation,
      tt_delegation TYPE STANDARD TABLE OF ty_delegation WITH EMPTY KEY.

    TYPES:
      BEGIN OF ty_state,
        status                   TYPE string,
        has_data                 TYPE abap_bool,
        "! The recommendation was made on the current requested values.
        recommendation_current   TYPE abap_bool,
        "! The values to be released are exactly the approved snapshot.
        payload_matches_approval TYPE abap_bool,
        "! Users who changed the requested values of this revision.
        editors                  TYPE string_table,
        recommender              TYPE string,
        roles                    TYPE tt_role_assignment,
        delegations              TYPE tt_delegation,
        "! Users who could be assigned as substitutes.
        candidates               TYPE string_table,
      END OF ty_state.

    TYPES:
      BEGIN OF ty_decision,
        allowed TYPE abap_bool,
        reason  TYPE string,
      END OF ty_decision.

    CLASS-METHODS decide
      IMPORTING is_state           TYPE ty_state
                iv_actor           TYPE string
                iv_action          TYPE string
      RETURNING VALUE(rs_decision) TYPE ty_decision.

    "! Role (R or A) for which an audited substitute is needed, or empty.
    CLASS-METHODS escalation_needed
      IMPORTING is_state       TYPE ty_state
      RETURNING VALUE(rv_role) TYPE string.

  PRIVATE SECTION.
    CLASS-METHODS has_role
      IMPORTING is_state      TYPE ty_state
                iv_user       TYPE string
                iv_role       TYPE string
      RETURNING VALUE(rv_has) TYPE abap_bool.

    CLASS-METHODS is_editor
      IMPORTING is_state         TYPE ty_state
                iv_user          TYPE string
      RETURNING VALUE(rv_editor) TYPE abap_bool.

    CLASS-METHODS allow
      RETURNING VALUE(rs_decision) TYPE ty_decision.

    CLASS-METHODS deny
      IMPORTING iv_reason          TYPE string
      RETURNING VALUE(rs_decision) TYPE ty_decision.
ENDCLASS.


CLASS zcl_pln_workflow_guard IMPLEMENTATION.

  METHOD decide.
    DATA(lv_status) = is_state-status.
    DATA(lv_open) = xsdbool( lv_status = status-draft OR lv_status = status-returned ).

    CASE iv_action.
      WHEN action-edit.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-preparer ) = abap_false.
          rs_decision = deny( reasons-not_preparer ).
        ELSEIF lv_open = abap_false.
          rs_decision = deny( reasons-locked_for_edit ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-submit.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-preparer ) = abap_false.
          rs_decision = deny( reasons-not_preparer ).
        ELSEIF lv_open = abap_false.
          rs_decision = deny( reasons-not_open ).
        ELSEIF is_state-has_data = abap_false.
          rs_decision = deny( reasons-no_data ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-recommend.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-reviewer ) = abap_false.
          rs_decision = deny( reasons-not_reviewer ).
        ELSEIF lv_status <> status-submitted.
          rs_decision = deny( reasons-not_submitted ).
        ELSEIF is_editor( is_state = is_state iv_user = iv_actor ) = abap_true.
          rs_decision = deny( reasons-reviewer_is_editor ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-approve.
        DATA(lv_authorised) = has_role( is_state = is_state iv_user = iv_actor iv_role = role-approver ).
        LOOP AT is_state-delegations INTO DATA(ls_delegation) WHERE to_user = iv_actor.
          IF has_role( is_state = is_state iv_user = ls_delegation-from_user iv_role = role-approver ) = abap_true.
            lv_authorised = abap_true.
          ENDIF.
        ENDLOOP.
        IF lv_authorised = abap_false.
          rs_decision = deny( reasons-no_approval_authority ).
        ELSEIF lv_status <> status-reviewed.
          rs_decision = deny( reasons-not_reviewed ).
        ELSEIF is_editor( is_state = is_state iv_user = iv_actor ) = abap_true.
          rs_decision = deny( reasons-approver_is_editor ).
        ELSEIF iv_actor = is_state-recommender.
          rs_decision = deny( reasons-approver_is_recommender ).
        ELSEIF is_state-recommendation_current = abap_false.
          rs_decision = deny( reasons-stale_recommendation ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-reject.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-reviewer ) = abap_false
           AND has_role( is_state = is_state iv_user = iv_actor iv_role = role-approver ) = abap_false.
          rs_decision = deny( reasons-not_reviewer_or_approver ).
        ELSEIF lv_status <> status-submitted AND lv_status <> status-reviewed.
          rs_decision = deny( reasons-nothing_to_reject ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-release.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-admin ) = abap_false.
          rs_decision = deny( reasons-not_admin ).
        ELSEIF lv_status <> status-approved.
          rs_decision = deny( reasons-not_approved ).
        ELSEIF is_state-payload_matches_approval = abap_false.
          rs_decision = deny( reasons-payload_differs ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN action-amend.
        IF has_role( is_state = is_state iv_user = iv_actor iv_role = role-preparer ) = abap_false
           AND has_role( is_state = is_state iv_user = iv_actor iv_role = role-admin ) = abap_false.
          rs_decision = deny( reasons-not_preparer_or_admin ).
        ELSEIF lv_status <> status-approved AND lv_status <> status-released.
          rs_decision = deny( reasons-not_amendable ).
        ELSE.
          rs_decision = allow( ).
        ENDIF.

      WHEN OTHERS.
        rs_decision = deny( reasons-unknown_action ).
    ENDCASE.
  ENDMETHOD.


  METHOD escalation_needed.
    DATA lv_role TYPE string.
    CASE is_state-status.
      WHEN status-submitted.
        lv_role = role-reviewer.
      WHEN status-reviewed.
        lv_role = role-approver.
      WHEN OTHERS.
        RETURN.
    ENDCASE.
    LOOP AT is_state-candidates INTO DATA(lv_user).
      IF is_editor( is_state = is_state iv_user = lv_user ) = abap_true.
        CONTINUE.
      ENDIF.
      IF lv_role = role-approver AND lv_user = is_state-recommender.
        CONTINUE.
      ENDIF.
      IF has_role( is_state = is_state iv_user = lv_user iv_role = lv_role ) = abap_true.
        RETURN.
      ENDIF.
    ENDLOOP.
    rv_role = lv_role.
  ENDMETHOD.


  METHOD has_role.
    rv_has = xsdbool( line_exists( is_state-roles[ user = iv_user role = iv_role ] ) ).
  ENDMETHOD.


  METHOD is_editor.
    rv_editor = xsdbool( line_exists( is_state-editors[ table_line = iv_user ] ) ).
  ENDMETHOD.


  METHOD allow.
    rs_decision-allowed = abap_true.
  ENDMETHOD.


  METHOD deny.
    rs_decision-allowed = abap_false.
    rs_decision-reason = iv_reason.
  ENDMETHOD.

ENDCLASS.

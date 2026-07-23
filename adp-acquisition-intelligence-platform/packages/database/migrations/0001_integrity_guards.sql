CREATE OR REPLACE FUNCTION adp_reject_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'hard delete is forbidden for %. Use archive, supersession, or retention workflows.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_append_only_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only and cannot be updated or deleted.', TG_TABLE_NAME
    USING ERRCODE = 'P0001';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION adp_reject_consent_record_rewrite()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (to_jsonb(OLD) - 'superseded_by_id' - 'revoked_at') <> (to_jsonb(NEW) - 'superseded_by_id' - 'revoked_at') THEN
    RAISE EXCEPTION '% consent records are immutable; create a superseding record instead.', TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER organizations_reject_hard_delete
BEFORE DELETE ON organizations
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
--> statement-breakpoint
CREATE TRIGGER contacts_reject_hard_delete
BEFORE DELETE ON contacts
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
--> statement-breakpoint
CREATE TRIGGER contact_channel_permissions_reject_hard_delete
BEFORE DELETE ON contact_channel_permissions
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
--> statement-breakpoint
CREATE TRIGGER organization_communication_restrictions_reject_hard_delete
BEFORE DELETE ON organization_communication_restrictions
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
--> statement-breakpoint
CREATE TRIGGER suppression_entries_reject_hard_delete
BEFORE DELETE ON suppression_entries
FOR EACH ROW EXECUTE FUNCTION adp_reject_hard_delete();
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER operational_state_transitions_append_only
BEFORE UPDATE OR DELETE ON operational_state_transitions
FOR EACH ROW EXECUTE FUNCTION adp_reject_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER contact_channel_permissions_reject_rewrite
BEFORE UPDATE ON contact_channel_permissions
FOR EACH ROW EXECUTE FUNCTION adp_reject_consent_record_rewrite();
--> statement-breakpoint
CREATE TRIGGER organization_communication_restrictions_reject_rewrite
BEFORE UPDATE ON organization_communication_restrictions
FOR EACH ROW EXECUTE FUNCTION adp_reject_consent_record_rewrite();
--> statement-breakpoint
CREATE TRIGGER suppression_entries_reject_rewrite
BEFORE UPDATE ON suppression_entries
FOR EACH ROW EXECUTE FUNCTION adp_reject_consent_record_rewrite();

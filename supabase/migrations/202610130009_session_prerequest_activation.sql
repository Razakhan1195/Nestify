-- Keep the already-verified staging RPC/session fence reproducible in promotion.
-- Function checks are defined in 202610130002 and preserve fresh sign-ins.
alter role authenticator set pgrst.db_pre_request='public.check_rezlee_session';
notify pgrst,'reload config';

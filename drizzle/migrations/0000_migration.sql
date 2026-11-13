CREATE TABLE public.intake_missions (
  id uuid PRIMARY KEY,
  stage text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.intake_missions TO service_role;
ALTER TABLE public.intake_missions ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) reads/writes missions; browsers hold just the id.
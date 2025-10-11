-- Database trigger to automatically create an account for new users
-- This replaces the custom /api/auth/setup endpoint

-- Function to create account for new user
CREATE OR REPLACE FUNCTION create_user_account()
RETURNS TRIGGER AS $$
DECLARE
  new_account_id uuid;
BEGIN
  -- Create a new account
  INSERT INTO public.accounts (id, name, created_at)
  VALUES (gen_random_uuid(), NEW.email || '''s Account', now())
  RETURNING id INTO new_account_id;

  -- Link the user to the account as owner
  INSERT INTO public.user_data (user_id, account_id, role, created_at)
  VALUES (NEW.id, new_account_id, 'owner', now());

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run the function when a new user is created
DROP TRIGGER IF EXISTS create_user_account_trigger ON auth.users;
CREATE TRIGGER create_user_account_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_account();
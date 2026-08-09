# Supabase Auth Setup

## Required Environment Variables

```text
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## First Admin Setup

1. Run `database/schema.sql` in Supabase SQL editor.
2. In Supabase Auth, create the first admin user with email/password.
3. Copy the new Auth user ID.
4. Insert the matching profile row:

```sql
insert into public.profiles (id, full_name, email, role, status)
values (
  'AUTH_USER_ID_HERE',
  'Admin User',
  'admin@example.com',
  'admin',
  'active'
);
```

## Ground Employee Setup

1. Create a Supabase Auth user for the employee.
2. Insert a profile row:

```sql
insert into public.profiles (id, full_name, email, role, status)
values (
  'AUTH_USER_ID_HERE',
  'Field Employee Name',
  'field@example.com',
  'ground_employee',
  'active'
);
```

## Why Profiles Are Required

Supabase Auth verifies email/password. The `profiles` table controls CRM role access.

If a user can sign in but has no `profiles` row, the app will show:

```text
Login succeeded, but no profile row exists for this user.
```

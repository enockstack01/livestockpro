/* ============================================
   SUPABASE CONFIGURATION
   ============================================
   Replace the values below with your actual
   Supabase project URL and anon (public) key.
   You can find these in:
   Supabase Dashboard → Settings → API
   ============================================ */

const SUPABASE_URL = 'https://yipucahrttypxgpnnjbp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jKpUFTzBqR2MGr7u-FUsmg_3jd1UiE2';

/* Initialize the Supabase client */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/*
============================================
DATABASE SCHEMA — Run this SQL in the
Supabase SQL Editor to create all tables:
============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  farm_name TEXT,
  location TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Animals table
CREATE TABLE animals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL,
  name TEXT,
  species TEXT NOT NULL,
  breed TEXT,
  sex TEXT,
  date_of_birth DATE,
  location TEXT,
  health_status TEXT DEFAULT 'Healthy',
  last_check_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Health records table
CREATE TABLE health_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id UUID REFERENCES animals(id) ON DELETE SET NULL,
  tag_id TEXT,
  disease TEXT,
  treatment TEXT,
  medicine TEXT,
  vet_name TEXT,
  check_date DATE,
  next_check_date DATE,
  status TEXT DEFAULT 'Under Treatment',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feeding records table
CREATE TABLE feeding_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_type TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT DEFAULT 'kg',
  cost NUMERIC,
  feeding_date DATE,
  animal_group TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Breeding records table
CREATE TABLE breeding_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id UUID REFERENCES animals(id) ON DELETE SET NULL,
  tag_id TEXT,
  breeding_date DATE,
  pregnancy_status TEXT DEFAULT 'Not Confirmed',
  expected_birth_date DATE,
  birth_date DATE,
  newborn_count INTEGER,
  newborn_details TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Production records table
CREATE TABLE production_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  animal_id UUID REFERENCES animals(id) ON DELETE SET NULL,
  tag_id TEXT,
  production_type TEXT NOT NULL,
  quantity NUMERIC,
  unit TEXT DEFAULT 'liters',
  production_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Finance records table
CREATE TABLE finance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  category TEXT,
  amount NUMERIC NOT NULL,
  date DATE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT DEFAULT 'Pending',
  priority TEXT DEFAULT 'Medium',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE animals ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE feeding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE breeding_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: users can only access their own data
CREATE POLICY "Users can view own profiles" ON profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profiles" ON profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profiles" ON profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own animals" ON animals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own animals" ON animals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own animals" ON animals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own animals" ON animals FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own health_records" ON health_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own health_records" ON health_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own health_records" ON health_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own health_records" ON health_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own feeding_records" ON feeding_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feeding_records" ON feeding_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own feeding_records" ON feeding_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own feeding_records" ON feeding_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own breeding_records" ON breeding_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own breeding_records" ON breeding_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own breeding_records" ON breeding_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own breeding_records" ON breeding_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own production_records" ON production_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own production_records" ON production_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own production_records" ON production_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own production_records" ON production_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own finance_records" ON finance_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own finance_records" ON finance_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own finance_records" ON finance_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own finance_records" ON finance_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own tasks" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own tasks" ON tasks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own tasks" ON tasks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own tasks" ON tasks FOR DELETE USING (auth.uid() = user_id);

============================================ */
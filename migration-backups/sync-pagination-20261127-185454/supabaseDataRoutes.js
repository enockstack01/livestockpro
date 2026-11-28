const express = require('express');
const crypto = require('crypto');

const { requireAuth } = require('../supabaseAuthMiddleware');
const { requireApproved } = require('../lib/supabaseAccounts');
const { sendSupabasePushToUser } = require('../lib/supabasePushNotify');

const router = express.Router();

const SCHEMAS = {
  profiles: [
    'farm_name', 'location', 'phone', 'avatar_url',
    'district', 'sector', 'cell'
  ],
  animals: [
    'tag_id', 'name', 'species', 'breed', 'sex',
    'date_of_birth', 'location', 'district', 'latitude',
    'longitude', 'health_status', 'last_check_date', 'notes'
  ],
  health_records: [
    'animal_id', 'tag_id', 'disease', 'treatment', 'medicine',
    'vet_name', 'check_date', 'next_check_date', 'status',
    'district', 'latitude', 'longitude', 'notes'
  ],
  feeding_records: [
    'feed_type', 'quantity', 'unit', 'cost', 'currency',
    'feeding_date', 'animal_group', 'district', 'latitude',
    'longitude', 'notes'
  ],
  breeding_records: [
    'animal_id', 'tag_id', 'breeding_date', 'pregnancy_status',
    'expected_birth_date', 'birth_date', 'newborn_count',
    'newborn_details', 'district', 'latitude', 'longitude', 'notes'
  ],
  production_records: [
    'animal_id', 'tag_id', 'production_type', 'quantity',
    'unit', 'production_date', 'district', 'latitude',
    'longitude', 'notes'
  ],
  finance_records: [
    'type', 'category', 'amount', 'currency', 'date',
    'description', 'animal_id', 'tag_id', 'district',
    'latitude', 'longitude'
  ],
  tasks: [
    'title', 'description', 'due_date', 'status',
    'priority', 'district', 'latitude', 'longitude'
  ],
  push_tokens: [
    'expo_push_token', 'platform', 'device_id'
  ]
};

const NUMERIC_FIELDS = new Set([
  'latitude', 'longitude', 'quantity', 'cost',
  'amount', 'newborn_count'
]);

const PUSH_TRIGGERS = {
  animals: {
    field: 'health_status',
    values: ['Critical', 'Deceased']
  },
  health_records: {
    field: 'status',
    values: ['Critical']
  }
};

const RESERVED_QUERY_PARAMS = new Set([
  'select', 'order', 'limit', 'updated_since', 'include_deleted'
]);

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

function toClient(doc, table) {
  if (!doc) return doc;

  if (table === 'profiles') {
    return { ...doc, id: doc.user_id };
  }

  return { ...doc };
}

function copyAllowedFields(source, fields) {
  const result = {};

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      result[field] = source[field];
    }
  }

  return result;
}

function getOwner(req) {
  if (req.params.table === 'push_tokens' || req.params.table === 'profiles') {
    return req.user.id;
  }

  return req.farmId;
}

function sendDbError(res, error, operation) {
  console.error(`Supabase data ${operation} error:`, error.message);

  return res.status(500).json({
    error: { message: `Unable to ${operation} data.` }
  });
}

async function callBooleanRpc(supabase, functionName) {
  const { data, error } = await supabase.rpc(functionName);

  if (error) throw error;
  return data === true;
}

// Authentication and approval.
router.use(requireAuth);
router.use(requireApproved);

// Resolve the user's farm scope using PostgreSQL helpers.
router.use(async (req, res, next) => {
  try {
    const { data: account, error: accountError } = await req.supabase
      .from('accounts')
      .select('account_type')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (accountError) throw accountError;

    if (account?.account_type === 'organization') {
      return res.status(403).json({
        error: {
          message: 'Organization accounts cannot access farm records through this endpoint.'
        }
      });
    }

    const [ownerResult, isOwner, isCollector] = await Promise.all([
      req.supabase.rpc('current_farm_owner_id'),
      callBooleanRpc(req.supabase, 'is_farm_owner'),
      callBooleanRpc(req.supabase, 'is_active_farm_collector')
    ]);

    if (ownerResult.error) throw ownerResult.error;

    const farmId = ownerResult.data;

    if (!farmId || (!isOwner && !isCollector)) {
      return res.status(403).json({
        error: {
          message: 'No active farm access was found for this account.'
        }
      });
    }

    req.farmId = farmId;
    req.farmRole = isCollector ? 'collector' : 'manager';

    next();
  } catch (error) {
    console.error('Supabase farm-scope error:', error.message);

    return res.status(500).json({
      error: { message: 'Unable to verify farm access.' }
    });
  }
});

// Validate requested table and enforce collector restrictions.
router.param('table', (req, res, next, table) => {
  const fields = SCHEMAS[table];

  if (!fields) {
    return res.status(404).json({
      error: { message: 'Unknown data table.' }
    });
  }

  req.fields = fields;

  if (req.farmRole === 'collector') {
    if (table === 'finance_records') {
      if (req.method === 'GET') {
        req.collectorFinanceRead = true;
      } else {
        return res.status(403).json({
          error: { message: 'Collectors cannot modify finance records.' }
        });
      }
    }

    if (table === 'profiles' && req.method !== 'GET') {
      return res.status(403).json({
        error: { message: 'Collectors cannot modify farm profiles.' }
      });
    }

    if (req.method === 'DELETE' && table !== 'push_tokens') {
      return res.status(403).json({
        error: { message: 'Collectors cannot delete farm records.' }
      });
    }
  }

  next();
});

function buildFilter(req) {
  const table = req.params.table;
  const filters = {};

  if (table === 'profiles' || table === 'push_tokens') {
    filters.user_id = req.user.id;
  } else {
    filters.user_id = req.farmId;
  }

  if (
    req.farmRole === 'collector' &&
    req.method === 'PATCH' &&
    table !== 'tasks' &&
    table !== 'profiles' &&
    table !== 'push_tokens'
  ) {
    filters.recorded_by = req.user.id;
  }

  if (req.query.id !== undefined) {
    if (!isUuid(req.query.id)) {
      throw new Error('Invalid record ID.');
    }

    if (table === 'profiles') {
      filters.user_id = req.query.id;
    } else {
      filters.id = req.query.id;
    }
  }

  for (const [key, value] of Object.entries(req.query)) {
    if (RESERVED_QUERY_PARAMS.has(key) || key === 'id') continue;
    if (!req.fields.includes(key)) continue;

    if (NUMERIC_FIELDS.has(key)) {
      const number = Number(value);

      if (!Number.isFinite(number)) {
        throw new Error(`Invalid numeric filter: ${key}`);
      }

      filters[key] = number;
    } else {
      filters[key] = value;
    }
  }

  return filters;
}

function applyFilters(query, filters) {
  for (const [key, value] of Object.entries(filters)) {
    query = query.eq(key, value);
  }

  return query;
}

function getSelectedColumns(req) {
  if (!req.query.select || req.query.select === '*') {
    return '*';
  }

  const requested = req.query.select
    .split(',')
    .map((field) => field.trim())
    .filter((field) => req.fields.includes(field));

  if (req.params.table === 'profiles') {
    return ['user_id', ...requested].join(',');
  }

  return ['id', ...requested].join(',');
}

function applyCommonQueryOptions(query, req, filters) {
  query = applyFilters(query, filters);

  if (req.query.include_deleted !== 'true') {
    query = query.is('deleted_at', null);
  }

  if (req.query.updated_since) {
    const date = new Date(req.query.updated_since);

    if (Number.isNaN(date.getTime())) {
      throw new Error('Invalid updated_since date.');
    }

    query = query.gt('updated_at', date.toISOString());
  }

  const order = req.query.order;

  if (order) {
    const parts = order.split('.');
    const field = parts[0];

    if (
      req.fields.includes(field) ||
      field === 'created_at' ||
      field === 'updated_at'
    ) {
      query = query.order(field, {
        ascending: parts[1] !== 'desc'
      });
    }
  }

  if (req.query.limit !== undefined) {
    const limit = Number(req.query.limit);

    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error('Invalid limit. Use an integer between 1 and 1000.');
    }

    query = query.limit(limit);
  }

  return query;
}

function notifyCriticalChange(table, row, previousValue, ownerId) {
  const trigger = PUSH_TRIGGERS[table];

  if (!trigger || !row) return;

  const currentValue = row[trigger.field];

  if (
    currentValue === previousValue ||
    !trigger.values.includes(currentValue)
  ) {
    return;
  }

  const title = table === 'animals'
    ? `Animal ${currentValue}`
    : 'Critical health record';

  const body = table === 'animals'
    ? `${row.name || row.tag_id || 'An animal'} has been marked ${currentValue}.`
    : `A health record for ${row.tag_id || 'an animal'} has been marked Critical.`;

  sendSupabasePushToUser(ownerId, {
    title,
    body,
    data: { table, id: row.id }
  });
}

// GET /:table
router.get('/:table', async (req, res) => {
  try {
    if (req.collectorFinanceRead) {
      return res.json([]);
    }

    const filters = buildFilter(req);
    const columns = getSelectedColumns(req);

    let query = req.supabase
      .from(req.params.table)
      .select(columns);

    query = applyCommonQueryOptions(query, req, filters);

    const { data, error } = await query;

    if (error) throw error;

    return res.json(
      (data || []).map((row) => toClient(row, req.params.table))
    );
  } catch (error) {
    if (
      error.message.startsWith('Invalid ') ||
      error.message.startsWith('Unknown ')
    ) {
      return res.status(400).json({
        error: { message: error.message }
      });
    }

    return sendDbError(res, error, 'read');
  }
});

// POST /:table
router.post('/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const input = Array.isArray(req.body) ? req.body : [req.body];

    if (!input.length) return res.json([]);

    if (
      input.some((item) =>
        !item || typeof item !== 'object' || Array.isArray(item)
      )
    ) {
      return res.status(400).json({
        error: { message: 'Each record must be an object.' }
      });
    }

    const ownerId = getOwner(req);

    // Profiles use user_id as their primary key.
    if (table === 'profiles') {
      const profile = copyAllowedFields(input[0], req.fields);

      const { data, error } = await req.supabase
        .from('profiles')
        .upsert(
          { user_id: req.user.id, ...profile },
          { onConflict: 'user_id', ignoreDuplicates: true }
        )
        .select('*');

      if (error) throw error;

      if (data?.length) {
        return res.json(data.map((row) => toClient(row, table)));
      }

      const { data: existing, error: readError } = await req.supabase
        .from('profiles')
        .select('*')
        .eq('user_id', req.user.id)
        .is('deleted_at', null);

      if (readError) throw readError;

      return res.json(
        (existing || []).map((row) => toClient(row, table))
      );
    }

    // Re-registering a device reactivates its existing push token.
    if (table === 'push_tokens') {
      const now = new Date().toISOString();

      const records = input.map((item) => {
        const fields = copyAllowedFields(item, req.fields);

        if (!fields.expo_push_token || !fields.device_id) {
          throw new Error(
            'Push tokens require expo_push_token and device_id.'
          );
        }

        return {
          ...fields,
          user_id: req.user.id,
          deleted_at: null,
          updated_at: now
        };
      });

      const { data, error } = await req.supabase
        .from('push_tokens')
        .upsert(records, {
          onConflict: 'user_id,device_id'
        })
        .select('*');

      if (error) throw error;

      return res.json(
        (data || []).map((row) => toClient(row, table))
      );
    }

    const records = input.map((item) => {
      const fields = copyAllowedFields(item, req.fields);
      const suppliedId = item.id;

      if (suppliedId !== undefined && !isUuid(suppliedId)) {
        throw new Error('Invalid record ID.');
      }

      return {
        id: suppliedId || crypto.randomUUID(),
        user_id: ownerId,
        recorded_by: req.user.id,
        ...fields
      };
    });

    // Return only rows actually inserted by this request.
    // Duplicate IDs are ignored, so retries do not create duplicate alerts.
    const { data: insertedRows, error } = await req.supabase
      .from(table)
      .upsert(records, {
        onConflict: 'id',
        ignoreDuplicates: true
      })
      .select('*');

    if (error) throw error;

    // Fetch all requested active records for the API response,
    // including records that already existed before this request.
    const ids = records.map((record) => record.id);

    const { data, error: readError } = await req.supabase
      .from(table)
      .select('*')
      .in('id', ids)
      .is('deleted_at', null);

    if (readError) throw readError;

    // Send critical alerts only for records newly inserted in this request.
    if (PUSH_TRIGGERS[table]) {
      for (const row of insertedRows || []) {
        if (
          PUSH_TRIGGERS[table].values.includes(
            row[PUSH_TRIGGERS[table].field]
          )
        ) {
          notifyCriticalChange(table, row, null, ownerId);
        }
      }
    }

    return res.json(
      (data || []).map((row) => toClient(row, table))
    );
  } catch (error) {
    if (
      error.message.startsWith('Invalid ') ||
      error.message.startsWith('Push tokens require')
    ) {
      return res.status(400).json({
        error: { message: error.message }
      });
    }

    return sendDbError(res, error, 'create');
  }
});
// PATCH /:table
router.patch('/:table', async (req, res) => {
  try {
    const table = req.params.table;
    const updates = copyAllowedFields(req.body || {}, req.fields);

    if (!Object.keys(updates).length) {
      return res.status(400).json({
        error: { message: 'No valid fields were provided.' }
      });
    }

    const filters = buildFilter(req);
    const trigger = PUSH_TRIGGERS[table];
    let previousRows = [];

    if (
      trigger &&
      Object.prototype.hasOwnProperty.call(updates, trigger.field)
    ) {
      let beforeQuery = req.supabase
        .from(table)
        .select(`id,${trigger.field}`);

      beforeQuery = applyFilters(beforeQuery, filters);
      beforeQuery = beforeQuery.is('deleted_at', null);

      const { data, error } = await beforeQuery;

      if (error) throw error;

      previousRows = data || [];
    }

    let updateQuery = req.supabase
      .from(table)
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      });

    updateQuery = applyFilters(updateQuery, filters);

    const { data, error } = await updateQuery.select('*');

    if (error) throw error;

    if (trigger) {
      const previousById = new Map(
        previousRows.map((row) => [row.id, row[trigger.field]])
      );

      for (const row of data || []) {
        notifyCriticalChange(
          table,
          row,
          previousById.get(row.id),
          getOwner(req)
        );
      }
    }

    return res.json(
      (data || []).map((row) => toClient(row, table))
    );
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({
        error: { message: error.message }
      });
    }

    return sendDbError(res, error, 'update');
  }
});

// DELETE /:table
// Soft delete preserves tombstones for mobile synchronization.
router.delete('/:table', async (req, res) => {
  try {
    const filters = buildFilter(req);
    const now = new Date().toISOString();

    let query = req.supabase
      .from(req.params.table)
      .update({
        deleted_at: now,
        updated_at: now
      });

    query = applyFilters(query, filters);

    const { error } = await query;

    if (error) throw error;

    return res.json({
      data: null,
      error: null
    });
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({
        error: { message: error.message }
      });
    }

    return sendDbError(res, error, 'delete');
  }
});

module.exports = router;


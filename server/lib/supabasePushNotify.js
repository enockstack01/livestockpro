const { createServiceClient } = require('../supabase');

async function sendSupabasePushToUser(userId, { title, body, data }) {
  try {
    const supabase = createServiceClient();

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (error) throw error;
    if (!tokens?.length) return;

    const messages = tokens.map((token) => ({
      to: token.expo_push_token,
      title,
      body,
      data,
      sound: 'default'
    }));

    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(messages)
    });

    if (!response.ok) {
      throw new Error(`Expo push request failed: HTTP ${response.status}`);
    }
  } catch (error) {
    console.error('Supabase push notification failed:', error.message);
  }
}

module.exports = { sendSupabasePushToUser };

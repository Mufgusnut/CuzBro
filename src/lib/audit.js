import { supabase } from '../supabase.js';
import { getCrewMember } from './crew.js';

export async function logCrewActivity({
  action,
  category = 'SYSTEM',
  resourceType = null,
  resourceId = null,
  resourceName = null,
  details = {}
}) {
  console.log('[BLACK BOX] Event requested:', {
    action,
    category,
    resourceType,
    resourceId,
    resourceName,
    details
  });

  try {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(
        '[BLACK BOX] Session lookup failed:',
        sessionError
      );

      return {
        success: false,
        error: sessionError,
        stage: 'SESSION_LOOKUP'
      };
    }

    if (
      !session?.access_token ||
      !session?.user?.id
    ) {
      const error = new Error(
        'Black Box could not find an authenticated crew session.'
      );

      console.error(
        '[BLACK BOX] No authenticated session:',
        error
      );

      return {
        success: false,
        error,
        stage: 'NO_SESSION'
      };
    }

    const user = session.user;
    const accessToken =
      session.access_token;

    const crew =
      getCrewMember(user.email);

    const payload = {
      user_id: user.id,
      crew_email: user.email || null,
      crew_name: crew.name,

      action: String(
        action || 'UNKNOWN'
      ),

      category: String(
        category || 'SYSTEM'
      ),

      resource_type:
        resourceType === null ||
        resourceType === undefined
          ? null
          : String(resourceType),

      resource_id:
        resourceId === null ||
        resourceId === undefined
          ? null
          : String(resourceId),

      resource_name:
        resourceName === null ||
        resourceName === undefined
          ? null
          : String(resourceName),

      details:
        details &&
        typeof details === 'object' &&
        !Array.isArray(details)
          ? details
          : {}
    };

    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL;

    const supabasePublishableKey =
      import.meta.env
        .VITE_SUPABASE_PUBLISHABLE_KEY;

    if (
      !supabaseUrl ||
      !supabasePublishableKey
    ) {
      const error = new Error(
        'Supabase environment variables are unavailable.'
      );

      console.error(
        '[BLACK BOX] Environment failure:',
        error
      );

      return {
        success: false,
        error,
        stage: 'ENVIRONMENT'
      };
    }

    console.log(
      '[BLACK BOX] Authenticated crew:',
      {
        email: user.email,
        userId: user.id,
        hasAccessToken:
          Boolean(accessToken)
      }
    );

    console.log(
      '[BLACK BOX] Inserting payload:',
      payload
    );

    const response = await fetch(
      `${supabaseUrl}/rest/v1/crew_activity`,
      {
        method: 'POST',

        headers: {
          apikey:
            supabasePublishableKey,

          Authorization:
            `Bearer ${accessToken}`,

          'Content-Type':
            'application/json',

          Prefer:
            'return=representation'
        },

        body:
          JSON.stringify(payload)
      }
    );

    const responseText =
      await response.text();

    let responseBody = null;

    if (responseText) {
      try {
        responseBody =
          JSON.parse(responseText);
      } catch {
        responseBody =
          responseText;
      }
    }

    if (!response.ok) {
      const error = {
        status:
          response.status,

        statusText:
          response.statusText,

        body:
          responseBody
      };

      console.error(
        '[BLACK BOX] INSERT FAILED:',
        error
      );

      return {
        success: false,
        error,
        stage: 'INSERT',
        payload
      };
    }

    const insertedRow =
      Array.isArray(responseBody)
        ? responseBody[0]
        : responseBody;

    console.log(
      '[BLACK BOX] EVENT RECORDED:',
      insertedRow
    );

    return {
      success: true,
      error: null,
      stage: 'COMPLETE',
      row: insertedRow
    };
  } catch (error) {
    console.error(
      '[BLACK BOX] UNEXPECTED FAILURE:',
      error
    );

    return {
      success: false,
      error,
      stage: 'UNEXPECTED'
    };
  }
}
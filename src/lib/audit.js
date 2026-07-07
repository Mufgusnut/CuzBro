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
      data: userData,
      error: userError
    } = await supabase.auth.getUser();

    if (userError) {
      console.error(
        '[BLACK BOX] Auth lookup failed:',
        userError
      );

      return {
        success: false,
        error: userError,
        stage: 'AUTH_LOOKUP'
      };
    }

    const user = userData?.user;

    if (!user?.id) {
      const error = new Error(
        'Black Box could not identify the authenticated Supabase user.'
      );

      console.error(
        '[BLACK BOX] No authenticated user:',
        error
      );

      return {
        success: false,
        error,
        stage: 'NO_USER'
      };
    }

    const crew = getCrewMember(user.email);

    const payload = {
      user_id: user.id,
      crew_email: user.email || null,
      crew_name: crew.name,
      action: String(action || 'UNKNOWN'),
      category: String(category || 'SYSTEM'),

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

    console.log(
      '[BLACK BOX] Inserting payload:',
      payload
    );

    const {
      data: insertedRows,
      error: insertError
    } = await supabase
      .from('crew_activity')
      .insert(payload)
      .select('*');

    if (insertError) {
      console.error(
        '[BLACK BOX] INSERT FAILED:',
        {
          message: insertError.message,
          details: insertError.details,
          hint: insertError.hint,
          code: insertError.code,
          fullError: insertError
        }
      );

      return {
        success: false,
        error: insertError,
        stage: 'INSERT',
        payload
      };
    }

    const insertedRow =
      insertedRows?.[0] || null;

    if (!insertedRow) {
      const error = new Error(
        'Supabase returned no inserted Black Box row.'
      );

      console.error(
        '[BLACK BOX] Insert returned no row:',
        {
          insertedRows,
          payload
        }
      );

      return {
        success: false,
        error,
        stage: 'VERIFY_INSERT',
        payload
      };
    }

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
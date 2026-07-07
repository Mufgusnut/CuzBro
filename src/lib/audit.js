import { supabase } from '../supabase.js';
import {
  getCrewMember
} from './crew.js';

export async function logCrewActivity({
  action,
  category = 'SYSTEM',
  resourceType = null,
  resourceId = null,
  resourceName = null,
  details = {}
}) {
  try {
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error(
        'Black Box session lookup failed:',
        sessionError
      );

      return {
        success: false,
        error: sessionError
      };
    }

    const user = session?.user;

    if (!user) {
      console.warn(
        'Black Box event ignored: no authenticated crew session.'
      );

      return {
        success: false,
        error: new Error(
          'No authenticated crew session.'
        )
      };
    }

    const crew =
      getCrewMember(user.email);

    const {
      error: insertError
    } = await supabase
      .from('crew_activity')
      .insert({
        user_id: user.id,
        crew_email: user.email,
        crew_name: crew.name,
        action,
        category,
        resource_type: resourceType,
        resource_id:
          resourceId === null ||
          resourceId === undefined
            ? null
            : String(resourceId),
        resource_name: resourceName,
        details:
          details &&
          typeof details === 'object'
            ? details
            : {}
      });

    if (insertError) {
      console.error(
        'Black Box event failed:',
        insertError
      );

      return {
        success: false,
        error: insertError
      };
    }

    return {
      success: true,
      error: null
    };
  } catch (error) {
    console.error(
      'Black Box unexpected failure:',
      error
    );

    return {
      success: false,
      error
    };
  }
}
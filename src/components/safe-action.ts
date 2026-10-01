import { unstable_rethrow } from "next/navigation";

export const CONNECTION_ERROR =
  "Couldn’t reach the store. Nothing was lost: check your connection and tap again.";

/**
 * Wraps a server action for useActionState. Without it, a dropped connection (or a request made
 * just after a new version went live) throws, and React swaps the whole page for the error
 * screen, losing everything typed. Instead the form gets an error message and keeps its input.
 * Next's own redirect and not-found signals still go through untouched.
 */
export function safeAction<State extends { error?: string; success?: string }>(
  action: (state: State, form: FormData) => Promise<State>,
  message = CONNECTION_ERROR,
) {
  return async (state: State, form: FormData): Promise<State> => {
    try {
      return await action(state, form);
    } catch (error) {
      unstable_rethrow(error);
      return { ...state, error: message, success: undefined };
    }
  };
}

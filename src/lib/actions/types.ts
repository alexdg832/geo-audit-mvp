export type ActionState = {
  error?: string;
  success?: string;
  /** Changes on every successful submission so a form can remount (clear) itself. */
  nonce?: number;
};

export const initialActionState: ActionState = {};

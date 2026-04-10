const PREFIX = 'oidc_spa_example_';

export const sessionKeys = {
  codeVerifier: `${PREFIX}code_verifier`,
  state: `${PREFIX}state`,
  nonce: `${PREFIX}nonce`,
  tokenJson: `${PREFIX}tokens`,
  userinfoJson: `${PREFIX}userinfo`,
} as const;

// The SDK clients guard on a key being present so the production build
// cannot construct them empty. Unit tests mock the SDKs entirely, so
// these placeholders are never sent anywhere; they only get past the
// guard.
process.env.ANTHROPIC_API_KEY ??= 'test-key-not-used'

// Moved to `@didactic/core`, where the phone can read it too. This
// re-export keeps the app's existing `@/lib/markAnchor` imports working; they
// are repointed at the package in their own pass rather than in the
// commit that moves the code.
export * from '@didactic/core/markAnchor'

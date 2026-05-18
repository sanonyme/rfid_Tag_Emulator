/**
 * Publish via package.json `publish` block using ZEUS_RELEASE_OWNER / ZEUS_RELEASE_REPO
 * from the process environment (loaded from .env by release scripts).
 */
export function electronBuilderPublishArgs() {
  return ['--publish', 'always']
}

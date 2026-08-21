/**
 * Package via package.json `build` block using ZEUS_RELEASE_OWNER / ZEUS_RELEASE_REPO
 * from the process environment (loaded from .env by release scripts).
 */
export function electronBuilderPackageArgs() {
  return ['--win', '--publish', 'never']
}

/** electron-builder GitHub uploads are flaky on Windows; release scripts upload separately. */
export function electronBuilderPublishArgs() {
  return electronBuilderPackageArgs()
}

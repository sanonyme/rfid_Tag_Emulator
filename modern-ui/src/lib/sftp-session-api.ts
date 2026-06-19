import type { ElectronAPI } from '@/types/electron.d'

/** Session-scoped SFTP API (binds sessionId to every IPC call). */
export type SftpSessionApi = {
  sessionId: string
  disconnect: () => Promise<void>
  readdir: ElectronAPI['sftpReaddir'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  readFile: ElectronAPI['sftpReadFile'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  writeFile: ElectronAPI['sftpWriteFile'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  writeTextFile: ElectronAPI['sftpWriteTextFile'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  mkdir: ElectronAPI['sftpMkdir'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  rename: ElectronAPI['sftpRename'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  unlink: ElectronAPI['sftpUnlink'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  rmrf: ElectronAPI['sftpRmrf'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  stat: ElectronAPI['sftpStat'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  calculateSize: ElectronAPI['sftpCalculateSize'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  setAttributes: ElectronAPI['sftpSetAttributes'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  findFiles: ElectronAPI['sftpFindFiles'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  findCancel: ElectronAPI['sftpFindCancel'] extends (sessionId: string, ...args: infer A) => infer R
    ? (...args: A) => R
    : never
  downloadSaveDialog: ElectronAPI['sftpDownloadSaveDialog'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  downloadToPath: ElectronAPI['sftpDownloadToPath'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  uploadFromLocal: ElectronAPI['sftpUploadFromLocal'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
  copyRemoteFile: ElectronAPI['sftpCopyRemoteFile'] extends (
    sessionId: string,
    ...args: infer A
  ) => infer R
    ? (...args: A) => R
    : never
}

export function bindSftpSession(api: ElectronAPI, sessionId: string): SftpSessionApi {
  return {
    sessionId,
    disconnect: () => api.sftpDisconnect(sessionId),
    readdir: (remotePath) => api.sftpReaddir(sessionId, remotePath),
    readFile: (remotePath) => api.sftpReadFile(sessionId, remotePath),
    writeFile: (remotePath, base64Data) => api.sftpWriteFile(sessionId, remotePath, base64Data),
    writeTextFile: (remotePath, text) => api.sftpWriteTextFile(sessionId, remotePath, text),
    mkdir: (remotePath) => api.sftpMkdir(sessionId, remotePath),
    rename: (oldPath, newPath) => api.sftpRename(sessionId, oldPath, newPath),
    unlink: (remotePath) => api.sftpUnlink(sessionId, remotePath),
    rmrf: (remotePath) => api.sftpRmrf(sessionId, remotePath),
    stat: (remotePath) => api.sftpStat(sessionId, remotePath),
    calculateSize: (remotePath) => api.sftpCalculateSize(sessionId, remotePath),
    setAttributes: (remotePath, attrs, options) =>
      api.sftpSetAttributes(sessionId, remotePath, attrs, options),
    findFiles: (options, operationId) => api.sftpFindFiles(sessionId, options, operationId),
    findCancel: () => api.sftpFindCancel(sessionId),
    downloadSaveDialog: (remotePath, operationId) =>
      api.sftpDownloadSaveDialog(sessionId, remotePath, operationId),
    downloadToPath: (remotePath, localPath, operationId, localRoot?) =>
      api.sftpDownloadToPath(sessionId, remotePath, localPath, operationId, localRoot),
    uploadFromLocal: (localPath, remotePath, operationId, localRoot?) =>
      api.sftpUploadFromLocal(sessionId, localPath, remotePath, operationId, localRoot),
    copyRemoteFile: (remoteSrc, remoteDest, operationId) =>
      api.sftpCopyRemoteFile(sessionId, remoteSrc, remoteDest, operationId),
  }
}

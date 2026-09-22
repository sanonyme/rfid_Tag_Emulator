import { describe, expect, it } from 'vitest'
import { formatSftpSize } from '../sftp-column-format'
import { posixJoin } from '../sftp-path-utils'
import type { LiveUploadProgress } from '../SftpSessionPanel'

describe('sftp live upload progress and drop targeting', () => {
  it('formats upload sizes for files accurately', () => {
    expect(formatSftpSize(500, false)).toBe('500 B')
    expect(formatSftpSize(2048, false)).toBe('2 KB')
    expect(formatSftpSize(5 * 1024 * 1024, false)).toBe('5 MB')
    expect(formatSftpSize(1.5 * 1024 * 1024 * 1024, false)).toBe('2 GB')
    expect(formatSftpSize(undefined, false)).toBe('—')
    expect(formatSftpSize(4096, true)).toBe('—')
  })

  it('calculates progress percentage correctly with clamping', () => {
    const calcPct = (loaded: number, total: number) =>
      total > 0 ? Math.min(100, Math.round((100 * loaded) / total)) : 0

    expect(calcPct(0, 1000)).toBe(0)
    expect(calcPct(250, 1000)).toBe(25)
    expect(calcPct(999, 1000)).toBe(100)
    expect(calcPct(1200, 1000)).toBe(100)
    expect(calcPct(0, 0)).toBe(0)
  })

  it('structures LiveUploadProgress payload with batch counter and live bytes', () => {
    const liveUpload: LiveUploadProgress = {
      id: 'op-123',
      fileName: 'tags_export.csv',
      targetDir: '/etc/rfid',
      progress: 45,
      status: 'uploading',
      totalFiles: 3,
      currentFileIndex: 1,
      bytesLoaded: 4500,
      bytesTotal: 10000,
    }

    expect(liveUpload.status).toBe('uploading')
    expect(liveUpload.fileName).toBe('tags_export.csv')
    expect(liveUpload.targetDir).toBe('/etc/rfid')
    expect(liveUpload.progress).toBe(45)
    expect(liveUpload.currentFileIndex).toBe(1)
    expect(liveUpload.totalFiles).toBe(3)
    expect(formatSftpSize(liveUpload.bytesLoaded, false)).toBe('4 KB')
    expect(formatSftpSize(liveUpload.bytesTotal, false)).toBe('10 KB')
  })

  it('correctly computes destination paths for dropped files onto folders and files', () => {
    const folderPath = '/home/user/downloads'
    const fileName = 'package.zip'
    expect(posixJoin(folderPath, fileName)).toBe('/home/user/downloads/package.zip')

    const rootTarget = '/'
    expect(posixJoin(rootTarget, fileName)).toBe('/package.zip')

    // If dropped on a file row, parent directory is extracted
    const dropOnFilePath = '/var/log/syslog.log'
    const parentDir = dropOnFilePath.slice(0, dropOnFilePath.lastIndexOf('/')) || '/'
    expect(parentDir).toBe('/var/log')
    expect(posixJoin(parentDir, fileName)).toBe('/var/log/package.zip')
  })
})

import { Injectable } from '@navios/core/legacy-compat'

export interface FileMetadata {
  id: string
  filename: string
  size: number
  mimeType: string
  content: ArrayBuffer
  createdAt: string
}

@Injectable()
export class FilesService {
  private files: Map<string, FileMetadata> = new Map()
  private idCounter = 0

  async upload(file: { filename: string; size: number; mimeType: string; content: ArrayBuffer }): Promise<FileMetadata> {
    const id = `file-${++this.idCounter}`
    const metadata: FileMetadata = {
      id,
      filename: file.filename,
      size: file.size,
      mimeType: file.mimeType,
      content: file.content,
      createdAt: new Date().toISOString(),
    }
    this.files.set(id, metadata)
    return metadata
  }

  async findById(id: string): Promise<FileMetadata | null> {
    return this.files.get(id) ?? null
  }

  async getAll(): Promise<FileMetadata[]> {
    return Array.from(this.files.values())
  }

  async clear(): Promise<void> {
    this.files.clear()
    this.idCounter = 0
  }
}

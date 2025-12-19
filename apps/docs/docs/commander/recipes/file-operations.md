---
sidebar_position: 2
---

# File Operations

This recipe shows how to create CLI commands for file operations like reading, writing, processing, and managing files.

## Basic File Commands

Create commands for basic file operations:

```typescript
import { Command, CommandHandler } from '@navios/commander'
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'
import * as fs from 'fs/promises'
import * as path from 'path'

@Injectable()
class FileService {
  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  async getStats(filePath: string) {
    return fs.stat(filePath)
  }
}

const readSchema = z.object({
  file: z.string(),
  encoding: z.string().default('utf-8'),
})

@Command({
  path: 'file:read',
  optionsSchema: readSchema,
})
export class ReadFileCommand implements CommandHandler<
  z.infer<typeof readSchema>
> {
  private fileService = inject(FileService)

  async execute(options) {
    if (!(await this.fileService.exists(options.file))) {
      throw new Error(`File not found: ${options.file}`)
    }

    const content = await this.fileService.readFile(options.file)
    console.log(content)
  }
}

const writeSchema = z.object({
  file: z.string(),
  content: z.string(),
  append: z.boolean().default(false),
})

@Command({
  path: 'file:write',
  optionsSchema: writeSchema,
})
export class WriteFileCommand implements CommandHandler<
  z.infer<typeof writeSchema>
> {
  private fileService = inject(FileService)

  async execute(options) {
    if (options.append) {
      const existing = await this.fileService.exists(options.file)
        ? await this.fileService.readFile(options.file)
        : ''
      await this.fileService.writeFile(
        options.file,
        existing + options.content
      )
    } else {
      await this.fileService.writeFile(options.file, options.content)
    }
    console.log(`File written: ${options.file}`)
  }
}
```

## File Processing Commands

Create commands for processing files:

```typescript
@Injectable()
class FileProcessorService {
  async processFile(
    input: string,
    output: string,
    format: 'json' | 'csv' | 'xml'
  ) {
    const content = await fs.readFile(input, 'utf-8')
    const processed = this.convertFormat(content, format)
    await fs.writeFile(output, processed, 'utf-8')
    return { input, output, format, size: processed.length }
  }

  private convertFormat(content: string, format: string): string {
    // Format conversion logic
    switch (format) {
      case 'json':
        return JSON.stringify({ data: content }, null, 2)
      case 'csv':
        return content.split('\n').map(line => line.split(',').join(',')).join('\n')
      case 'xml':
        return `<data>${content}</data>`
      default:
        return content
    }
  }
}

const processSchema = z.object({
  input: z.string(),
  output: z.string().optional(),
  format: z.enum(['json', 'csv', 'xml']).default('json'),
})

@Command({
  path: 'file:process',
  optionsSchema: processSchema,
})
export class ProcessFileCommand implements CommandHandler<
  z.infer<typeof processSchema>
> {
  private processor = inject(FileProcessorService)

  async execute(options) {
    const output = options.output || options.input.replace(/\.[^.]+$/, `.${options.format}`)
    const result = await this.processor.processFile(
      options.input,
      output,
      options.format
    )
    console.log(`Processed: ${result.input} -> ${result.output}`)
    console.log(`Format: ${result.format}, Size: ${result.size} bytes`)
  }
}
```

## File Search Commands

Create commands for searching files:

```typescript
@Injectable()
class FileSearchService {
  async search(
    directory: string,
    pattern: string,
    recursive: boolean = true
  ): Promise<string[]> {
    const files: string[] = []
    await this.searchDirectory(directory, pattern, recursive, files)
    return files
  }

  private async searchDirectory(
    dir: string,
    pattern: string,
    recursive: boolean,
    files: string[]
  ) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      if (entry.isFile() && entry.name.match(new RegExp(pattern))) {
        files.push(fullPath)
      } else if (entry.isDirectory() && recursive) {
        await this.searchDirectory(fullPath, pattern, recursive, files)
      }
    }
  }
}

const searchSchema = z.object({
  directory: z.string().default('.'),
  pattern: z.string(),
  recursive: z.boolean().default(true),
})

@Command({
  path: 'file:search',
  optionsSchema: searchSchema,
})
export class SearchFileCommand implements CommandHandler<
  z.infer<typeof searchSchema>
> {
  private searchService = inject(FileSearchService)

  async execute(options) {
    const files = await this.searchService.search(
      options.directory,
      options.pattern,
      options.recursive
    )
    
    if (files.length === 0) {
      console.log('No files found')
    } else {
      console.log(`Found ${files.length} file(s):`)
      files.forEach((file) => console.log(`  - ${file}`))
    }
  }
}
```

## File Statistics Commands

Create commands for file statistics:

```typescript
@Injectable()
class FileStatsService {
  async getStats(filePath: string) {
    const stats = await fs.stat(filePath)
    return {
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      accessed: stats.atime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory(),
    }
  }

  async getDirectoryStats(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    let totalSize = 0
    let fileCount = 0
    let dirCount = 0

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name)
      const stats = await fs.stat(fullPath)
      
      if (entry.isFile()) {
        totalSize += stats.size
        fileCount++
      } else if (entry.isDirectory()) {
        dirCount++
      }
    }

    return { totalSize, fileCount, dirCount }
  }
}

const statsSchema = z.object({
  file: z.string(),
  format: z.enum(['human', 'json']).default('human'),
})

@Command({
  path: 'file:stats',
  optionsSchema: statsSchema,
})
export class FileStatsCommand implements CommandHandler<
  z.infer<typeof statsSchema>
> {
  private statsService = inject(FileStatsService)

  async execute(options) {
    const stats = await this.statsService.getStats(options.file)
    
    if (options.format === 'json') {
      console.log(JSON.stringify(stats, null, 2))
    } else {
      console.log(`File: ${options.file}`)
      console.log(`Size: ${this.formatBytes(stats.size)}`)
      console.log(`Created: ${stats.created}`)
      console.log(`Modified: ${stats.modified}`)
      console.log(`Type: ${stats.isFile ? 'File' : 'Directory'}`)
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = bytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`
  }
}

const dirStatsSchema = z.object({
  directory: z.string().default('.'),
})

@Command({
  path: 'file:dir-stats',
  optionsSchema: dirStatsSchema,
})
export class DirectoryStatsCommand implements CommandHandler<
  z.infer<typeof dirStatsSchema>
> {
  private statsService = inject(FileStatsService)

  async execute(options) {
    const stats = await this.statsService.getDirectoryStats(options.directory)
    console.log(`Directory: ${options.directory}`)
    console.log(`Total size: ${this.formatBytes(stats.totalSize)}`)
    console.log(`Files: ${stats.fileCount}`)
    console.log(`Directories: ${stats.dirCount}`)
  }

  private formatBytes(bytes: number): string {
    // Same as above
    return `${(bytes / 1024).toFixed(2)} KB`
  }
}
```

## File Copy and Move Commands

Create commands for copying and moving files:

```typescript
@Injectable()
class FileOperationService {
  async copy(source: string, destination: string) {
    await fs.copyFile(source, destination)
  }

  async move(source: string, destination: string) {
    await fs.rename(source, destination)
  }

  async delete(filePath: string) {
    await fs.unlink(filePath)
  }
}

const copySchema = z.object({
  source: z.string(),
  destination: z.string(),
  overwrite: z.boolean().default(false),
})

@Command({
  path: 'file:copy',
  optionsSchema: copySchema,
})
export class CopyFileCommand implements CommandHandler<
  z.infer<typeof copySchema>
> {
  private fileService = inject(FileOperationService)
  private fileService2 = inject(FileService)

  async execute(options) {
    if (!(await this.fileService2.exists(options.source))) {
      throw new Error(`Source file not found: ${options.source}`)
    }

    if (await this.fileService2.exists(options.destination) && !options.overwrite) {
      throw new Error(`Destination file exists. Use --overwrite to replace.`)
    }

    await this.fileService.copy(options.source, options.destination)
    console.log(`Copied: ${options.source} -> ${options.destination}`)
  }
}

const moveSchema = z.object({
  source: z.string(),
  destination: z.string(),
})

@Command({
  path: 'file:move',
  optionsSchema: moveSchema,
})
export class MoveFileCommand implements CommandHandler<
  z.infer<typeof moveSchema>
> {
  private fileService = inject(FileOperationService)
  private fileService2 = inject(FileService)

  async execute(options) {
    if (!(await this.fileService2.exists(options.source))) {
      throw new Error(`Source file not found: ${options.source}`)
    }

    await this.fileService.move(options.source, options.destination)
    console.log(`Moved: ${options.source} -> ${options.destination}`)
  }
}

const deleteSchema = z.object({
  file: z.string(),
  force: z.boolean().default(false),
})

@Command({
  path: 'file:delete',
  optionsSchema: deleteSchema,
})
export class DeleteFileCommand implements CommandHandler<
  z.infer<typeof deleteSchema>
> {
  private fileService = inject(FileOperationService)
  private fileService2 = inject(FileService)

  async execute(options) {
    if (!(await this.fileService2.exists(options.file))) {
      if (options.force) {
        return // File doesn't exist, nothing to delete
      }
      throw new Error(`File not found: ${options.file}`)
    }

    await this.fileService.delete(options.file)
    console.log(`Deleted: ${options.file}`)
  }
}
```

## Module Organization

Organize file commands into a module:

```typescript
import { CliModule } from '@navios/commander'
import { ReadFileCommand } from './commands/read-file.command'
import { WriteFileCommand } from './commands/write-file.command'
import { ProcessFileCommand } from './commands/process-file.command'
import { SearchFileCommand } from './commands/search-file.command'
import { FileStatsCommand } from './commands/file-stats.command'
import { DirectoryStatsCommand } from './commands/directory-stats.command'
import { CopyFileCommand } from './commands/copy-file.command'
import { MoveFileCommand } from './commands/move-file.command'
import { DeleteFileCommand } from './commands/delete-file.command'

@CliModule({
  commands: [
    ReadFileCommand,
    WriteFileCommand,
    ProcessFileCommand,
    SearchFileCommand,
    FileStatsCommand,
    DirectoryStatsCommand,
    CopyFileCommand,
    MoveFileCommand,
    DeleteFileCommand,
  ],
})
export class FileModule {}
```

## Usage Examples

```bash
# Read file
node cli.js file:read --file data.txt
node cli.js file:read --file data.txt --encoding utf-8

# Write file
node cli.js file:write --file output.txt --content "Hello, World!"
node cli.js file:write --file output.txt --content "Appended" --append

# Process file
node cli.js file:process --input data.txt --output data.json --format json
node cli.js file:process --input data.txt --format csv

# Search files
node cli.js file:search --pattern "\.ts$" --directory src
node cli.js file:search --pattern "test" --recursive false

# File statistics
node cli.js file:stats --file data.txt
node cli.js file:stats --file data.txt --format json
node cli.js file:dir-stats --directory src

# Copy and move
node cli.js file:copy --source file.txt --destination backup.txt
node cli.js file:copy --source file.txt --destination backup.txt --overwrite
node cli.js file:move --source old.txt --destination new.txt
node cli.js file:delete --file temp.txt
node cli.js file:delete --file temp.txt --force
```


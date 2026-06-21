import { workerData, parentPort } from 'worker_threads'
import { grepInTree, grepMultiInTree, findFilesInTree, findMultiInTree } from './fileSearch'

type WorkerRequest =
  | { type: 'grep'; root: string; query: string; subpath?: string; maxResults?: number }
  | {
      type: 'multi-grep'
      root: string
      queries: string[]
      maxResultsPerQuery: number[]
      subpath?: string
    }
  | { type: 'find'; root: string; pattern: string; subpath?: string; maxResults?: number }
  | {
      type: 'multi-find'
      root: string
      patterns: string[]
      maxResultsPerPattern: number[]
      subpath?: string
    }

async function run() {
  const req = workerData as WorkerRequest

  if (req.type === 'grep') {
    const result = await grepInTree(req.root, req.query, {
      subpath: req.subpath,
      maxResults: req.maxResults,
      onProgress: (scanned) => parentPort!.postMessage({ type: 'progress', scanned })
    })
    parentPort!.postMessage({ type: 'result', data: result })
  } else if (req.type === 'multi-grep') {
    const result = await grepMultiInTree(req.root, req.queries, req.maxResultsPerQuery, {
      subpath: req.subpath,
      onProgress: (scanned) => parentPort!.postMessage({ type: 'progress', scanned })
    })
    parentPort!.postMessage({ type: 'result', data: result })
  } else if (req.type === 'multi-find') {
    const result = await findMultiInTree(req.root, req.patterns, req.maxResultsPerPattern, {
      subpath: req.subpath,
      onProgress: (scanned) => parentPort!.postMessage({ type: 'progress', scanned })
    })
    parentPort!.postMessage({ type: 'result', data: result })
  } else {
    const result = await findFilesInTree(req.root, req.pattern, {
      subpath: req.subpath,
      maxResults: req.maxResults,
      onProgress: (scanned) => parentPort!.postMessage({ type: 'progress', scanned })
    })
    parentPort!.postMessage({ type: 'result', data: result })
  }
}

run().catch((err) => parentPort!.postMessage({ type: 'error', message: String(err) }))

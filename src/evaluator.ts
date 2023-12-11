import { MarkdownSectionInformation, MarkdownView, sanitizeHTMLToDom } from 'obsidian';
import sci from '../lib/sci.js'
import { IntervalsManager } from './intervals.js';
import ObsidianClojure from './main.js';
import CryptoJS from 'crypto-js';

interface EvalCallbacks {
  onRenderText: (info: any) => void
  onRenderHTML: (info: any) => void
  onRenderUnsafeHTML: (info: any) => void
  onRenderCode: (info: any) => void
  onRenderReagent: (reagentComponent: any) => void
  onSetInterval: (handler: TimerHandler, intervalMs: number) => void
}

function initialize(global_object: any) {
  return sci.init(global_object)
}

// Receives a string with HTML, and returns a sanitized HTMLElement
function defaultSanitize(str: string) {
  const sanitizer = new Sanitizer();
  return sanitizer.sanitizeFor('div', str);
}

function sha256(message: string): string {
  return CryptoJS.SHA256(message).toString()
}

function extractCodeBlocks(lang: string, markdown: string): CodeBlock[] {
  const lines = markdown.split('\n');
  const codeBlocks: CodeBlock[] = [];
  let isInCodeBlock = false;
  let currentBlock = '';
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.match(`^\`\`\`${lang}(\s|$)`)) {
          isInCodeBlock = true;
          blockStartLine = i;
          currentBlock = '';
      } else if (line.match(`^\`\`\`(\s|$)`) && isInCodeBlock) {
          isInCodeBlock = false;
          codeBlocks.push({ 
            source: currentBlock.trim(),
            lineStart: blockStartLine,
            lineEnd: i,
            isInline: false
          });
      } else if (isInCodeBlock) {
          currentBlock += line + '\n';
      } else {
        // Handling inline code
        const inlineRegex = /`\|([^`]+)`/g
        let inlineMatch
        let inlineIndex = 0
        while ((inlineMatch = inlineRegex.exec(line)) !== null) {
            codeBlocks.push({ 
                source: inlineMatch[1].trim(), 
                lineStart: i, 
                lineEnd: i,
                isInline: true,
                inlineIndex
            })
            inlineIndex++
        }
    }
  }

  return codeBlocks;
}

export class ClojureEvaluator {

  private plugin: ObsidianClojure
  private sciContext: any;
  private openMarkdownFilePaths: string[] = [];
  private documentEvaluations: { [sourcePath: string]: DocumentEvaluation } = {};

  constructor(plugin: ObsidianClojure) {
    this.plugin = plugin

    this.sciContext = initialize(window)

    plugin.registerEvent(
      plugin.app.workspace.on('layout-change', () => {
        const markdownLeaves = plugin.app.workspace.getLeavesOfType('markdown')
        const openMarkdownFilePaths = markdownLeaves.map(leaf => (leaf.view as MarkdownView).file.path)
        const recentlyClosedMarkdownFilePaths = this.openMarkdownFilePaths.filter(path => !openMarkdownFilePaths.includes(path))
        for (const path of recentlyClosedMarkdownFilePaths) {
          // TODO This also gets triggered if a file is moved rather than closed which is not ideal
          this.onFileClose(path)
        }
        this.openMarkdownFilePaths = openMarkdownFilePaths
      })
    )
  }

  public evaluate(documentPath: string, documentMarkdown: string): DocumentEvaluation {
    const hash = sha256(documentMarkdown)
    let documentEvaluation = this.documentEvaluations[documentPath]
    if (documentEvaluation === undefined || documentEvaluation.hash !== hash) {
      // TODO If a code block is completely deleted the post-processing callback isn't triggered and we don't get an
      //   opportunity to detach.
      documentEvaluation?.detach()

      const evaluations = this.evaluateDocument(documentMarkdown, { sanitizer: sanitizeHTMLToDom })
      documentEvaluation = new DocumentEvaluation(this.plugin, hash, evaluations)
      this.documentEvaluations[documentPath] = documentEvaluation
    }
    return documentEvaluation
  }

  public evaluateSource(source: string, callbacks: EvalCallbacks) {
    let output: string = ''
    let isError: boolean = false

    try {
      output = sci.eval(this.sciContext, source, callbacks)
    } catch (err) {
      console.error(err)
      console.trace()
      if (this.plugin.settings.fullErrors) {
        output = sci.ppStr(err)
      } else {
        output = err.message
      }
      isError = true
    }

    return {
      output: output,
      isError: isError
    }
  }

  public clear() {
    for (const documentEvaluation of Object.values(this.documentEvaluations)) {
      documentEvaluation.detach()
    }
    this.documentEvaluations = {}
  }

  private evaluateDocument(markdown: string, opts: any): CodeBlockEvaluation[] {
    const lang = this.plugin.settings.blockLanguage.toString()
    const codeBlocks = extractCodeBlocks(lang, markdown)
    const evaluations: CodeBlockEvaluation[] = [];
    for (const codeBlock of codeBlocks) {
      const evaluation = new CodeBlockEvaluation(this.plugin, codeBlock, opts)
      evaluations.push(evaluation)
    }
    return evaluations
  }

  private onFileClose(path: string) {
    this.documentEvaluations[path]?.detach()
  }
}

interface CodeBlock {
  source: string
  lineStart: number
  lineEnd: number
  isInline: boolean
  inlineIndex?: number
}

export class CodeBlockEvaluation {
  public codeBlock: CodeBlock
  public output?: string
  public isError?: boolean
  public renderFunction?: (resultsCodeEl: HTMLElement) => void

  private el?: HTMLElement
  private plugin: ObsidianClojure
  private _intervalsManager?: IntervalsManager

  constructor(plugin: ObsidianClojure, codeBlock: CodeBlock, opts: any) {
    this.plugin = plugin
    this.codeBlock = codeBlock
    this.eval(opts)
  }

  public attach(el: HTMLElement) {
    if (this.el === el) return
    this.el = el
    this.render()
  }

  public detach() {
    this.el = null
    this._intervalsManager?.killAll()
  }

  private intervalsManager(): IntervalsManager {
    if (this._intervalsManager == null) {
      this._intervalsManager = new IntervalsManager(this.plugin)
    }
    return this._intervalsManager
  }

  private eval(opts: any) {
    const sanitizer = opts?.sanitizer || defaultSanitize

    const callbacks: EvalCallbacks = {
      onRenderText: (info: any) => {
        this.setRenderFunction((r) => r.innerText = info)
      },
      onRenderHTML: (info: any) => {
        this.setRenderFunction((r) => r.appendChild(sanitizer(info)))
      },
      // TODO not implemented on the SCI side yet, not sure we need or not
      onRenderUnsafeHTML: (info: any) => {
        this.setRenderFunction((r) => r.innerHTML = info)
      },
      onRenderCode: (info: any) => {
        this.setRenderFunction((r) => r.innerText = "=> " + sci.ppStr(info))
      },
      onRenderReagent: (reagentComponent: any) => {
        this.setRenderFunction((r) => {
          setTimeout(() => {
            sci.renderReagent(reagentComponent, r)
          }, 10)
        })
      },
      onSetInterval: (handler: TimerHandler, intervalMs: number) => {
        this.intervalsManager().setInterval(handler, intervalMs)
      }
    }

    const result = this.plugin.evaluator.evaluateSource(this.codeBlock.source, callbacks)

    this.output = result.output
    this.isError = result.isError
  }

  private setRenderFunction(func: (resultsCodeEl: HTMLElement) => void) {
    this.renderFunction = func
    this.render()
  }

  private render() {
    const el = this.el
    if (el == null) return

    if (this.codeBlock.isInline) {
      this.plugin.elements.renderInlineCode(this.el, this)
    } else {
      this.plugin.elements.renderCode(this.el, this)
    }
  }
}

export class DocumentEvaluation {
  /** From the last time the document was evaluated. */
  public hash: string
  public codeBlockEvaluations: CodeBlockEvaluation[]

  private plugin: ObsidianClojure

  constructor(plugin: ObsidianClojure, hash: string, codeBlockEvaluations: CodeBlockEvaluation[]) {
    this.plugin = plugin
    this.hash = hash
    this.codeBlockEvaluations = codeBlockEvaluations
  }

  public attach(el: HTMLElement, sectionInfo: MarkdownSectionInformation) {
    let codeBlockIndex = 0
    let lastAttachedIndex: number | null = null
    for (const codeBlockEvaluation of this.codeBlockEvaluations) {
      const codeBlock = codeBlockEvaluation.codeBlock
      if (!codeBlock.isInline) {
        if (codeBlock.lineStart == sectionInfo.lineStart && codeBlock.lineEnd == sectionInfo.lineEnd) {
          codeBlockEvaluation.attach(el)
          lastAttachedIndex = codeBlockIndex
          break
        }
      } else if (codeBlock.lineStart >= sectionInfo.lineStart && codeBlock.lineStart <= sectionInfo.lineEnd) {
        codeBlockEvaluation.attach(el)
        lastAttachedIndex = codeBlockIndex
      }
      codeBlockIndex++
    }

    if (lastAttachedIndex != null) {
      this.renderFrom(el, lastAttachedIndex)
    }
  }

  public detach() {
    for (const evaluation of this.codeBlockEvaluations) {
      evaluation.detach()
    }
  }

  /**
   * Attempt to rerender code elements that follow `el`.
   */
  private renderFrom(sectionEl: HTMLElement, codeBlockIndex: number) {
    // TODO If a parent element is already queued up then maybe we can skip this
    this.plugin.elements.forEachSection(sectionEl, (sectionElement, codeElementSource) => {
      const codeBlockEvaluation = this.codeBlockEvaluations[codeBlockIndex]
      const codeBlock = codeBlockEvaluation.codeBlock

      if (codeElementSource !== codeBlock.source) {
        console.error(`Code blocks did not match at index ${codeBlockIndex}.\nCode element source: ${codeElementSource}\nCode block source: ${codeBlock.source}`)
        return false
      }

      codeBlockEvaluation.attach(sectionElement)

      codeBlockIndex++
      return codeBlockIndex < this.codeBlockEvaluations.length
    })
  }
}

import "./inject.css"
import { Editor, EDITORS } from "./types"
import { getOptions, debounce } from "./utils"

const run = async () => {
  const OPTIONS = await getOptions()

  function debug(...args: unknown[]) {
    // eslint-disable-next-line no-console
    if (OPTIONS.showDebugMessages) console.log.apply(null, ["[OPEN-IN-IDE EXTENSION]", ...args])
  }

  const EDITOR_OPENERS: {
    [e in Editor]: (repo: string, file: string, line?: string) => string
  } = {
    vscode: (repo: string, file: string, line?: string) => {
      const url = `vscode://file/${OPTIONS.localPathForRepositories}/${repo}/${file}:${line ?? "1"}`
      location.href = url
      return url
    },
    "vscode-wsl": (repo: string, file: string, line?: string) => {
      const url = `vscode://vscode-remote/wsl+Ubuntu/${OPTIONS.localPathForRepositories}/${repo}/${file}:${
        line ?? "1"
      }:1`
      location.href = url
      return url
    },
    vscodium: (repo: string, file: string, line?: string) => {
      const url = `vscodium://file/${OPTIONS.localPathForRepositories}/${repo}/${file}:${line ?? "1"}`
      location.href = url
      return url
    },
    "vscodium-wsl": (repo: string, file: string, line?: string) => {
      const url = `vscodium://vscode-remote/wsl+Ubuntu/${OPTIONS.localPathForRepositories}/${repo}/${file}:${
        line ?? "1"
      }:1`
      location.href = url
      return url
    },
    "vscode-insiders": (repo: string, file: string, line?: string) => {
      const url = `vscode-insiders://file/${OPTIONS.localPathForRepositories}/${repo}/${file}:${line ?? "1"}`
      location.href = url
      return url
    },
    "vscode-insiders-wsl": (repo: string, file: string, line?: string) => {
      const url = `vscode-insiders://vscode-remote/wsl+Ubuntu/${OPTIONS.localPathForRepositories}/${repo}/${file}:${
        line ?? "1"
      }:1`
      location.href = url
      return url
    },
    phpstorm: (repo: string, file: string, line?: string) => {
      const url = `phpstorm://open?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${line ?? "1"}`
      location.href = url
      return url
    },
    "intellij-idea": (repo: string, file: string, line?: string) => {
      const url = `idea://open?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${line ?? "1"}`
      location.href = url
      return url
    },
    webstorm: (repo: string, file: string, line?: string) => {
      const url = `webstorm://open?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${line ?? "1"}`
      location.href = url
      return url
    },
    goland: (repo: string, file: string, line?: string) => {
      const url = `goland://open?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${line ?? "1"}`
      location.href = url
      return url
    },
    clion: (repo: string, file: string, line?: string) => {
      const url = `clion://open?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${line ?? "1"}`
      location.href = url
      return url
    },
    "jetbrains-webserver": (repo: string, file: string, line?: string) => {
      const url = `http://localhost:63342/api/file?file=${OPTIONS.localPathForRepositories}/${repo}/${file}&line=${
        line ?? "1"
      }`
      fetch(url).catch(() => alert(`Unable to open the file.\nIs the built-in web server started on localhost:63342 ?`))
      return url
    },
  }

  const generateIconElement = (repo: string, file: string, lineNumber?: string | null) => {
    const editorIconSpanElement = document.createElement("span")
    const filename = file.split("/").pop() as string
    let iconTitle = `Open ${filename} in ${EDITORS[OPTIONS.defaultIde].name}`
    if (lineNumber) iconTitle = `${iconTitle} at line ${lineNumber}`
    editorIconSpanElement.title = iconTitle
    editorIconSpanElement.classList.add("open-in-ide-icon")

    const editorIconImgElement = document.createElement("img")
    editorIconImgElement.src = chrome.runtime.getURL(EDITORS[OPTIONS.defaultIde].getIcon(32))
    editorIconSpanElement.appendChild(editorIconImgElement)

    editorIconSpanElement.addEventListener("click", e => {
      e.preventDefault()
      const editorUrl = EDITOR_OPENERS[OPTIONS.defaultIde](repo, file, lineNumber ?? undefined)
      debug(`Opened ${editorUrl}`)
    })
    return editorIconSpanElement
  }

  const filePathRegExp = /.+\/([^/]+)\/(blob|tree)\/[^/]+\/(.*)/

  // cache: diff hash -> full file path, persists across addEditorIcons calls for the same PR
  const diffHashToPathCache: Record<string, string> = {}

  // build diff-hash -> full-path mapping from the in-page file tree (new experience)
  const buildCacheFromNewFileTree = (root: ParentNode) => {
    // new experience: li[role="treeitem"] with id = full file path
    const treeItems = root.querySelectorAll<HTMLElement>('li[role="treeitem"]')
    treeItems.forEach(item => {
      // file items have no nested group (directories do)
      if (item.querySelector('ul[role="group"]')) return
      const link = item.querySelector('a[href*="#diff-"]')
      const href = link?.getAttribute("href")
      const hash = href?.match(/#(diff-[a-f0-9]+)/)?.[1]
      if (hash && item.id) {
        diffHashToPathCache[hash] = item.id
      }
    })
  }

  // build diff-hash -> full-path mapping from old-style <file-tree> element
  const buildCacheFromOldFileTree = (fileTree: Element) => {
    fileTree.querySelectorAll<HTMLElement>('.js-tree-node[data-tree-entry-type="file"]').forEach(fileNode => {
      const href = fileNode.querySelector("a")?.getAttribute("href")
      const hash = href?.match(/#(diff-[a-f0-9]+)/)?.[1]
      if (!hash) return

      // get filename from the last non-empty span
      let fileName = ""
      fileNode.querySelectorAll("span").forEach(s => {
        const t = s.textContent?.trim()
        if (t) fileName = t
      })

      // walk up all ancestor directory nodes to build full path
      const dirParts: string[] = []
      let ancestor: HTMLElement | null = fileNode.parentElement
      while (ancestor && ancestor !== fileTree) {
        if (ancestor.matches('.js-tree-node[data-tree-entry-type="directory"]')) {
          let dirName = ""
          ancestor.querySelectorAll(":scope > button span, :scope > a span").forEach(s => {
            const t = s.textContent?.trim()
            if (t) dirName = t
          })
          if (dirName) dirParts.unshift(dirName)
        }
        ancestor = ancestor.parentElement
      }

      const dirPath = dirParts.join("/")
      diffHashToPathCache[hash] = dirPath ? `${dirPath}/${fileName}` : fileName
    })
  }

  // stream fetch helper: reads response body until endMarker is found, then aborts
  const streamUntil = async (url: string, endMarker: (html: string) => boolean): Promise<string> => {
    const response = await fetch(url, {
      credentials: "same-origin",
      headers: { "Turbo-Frame": "repo-content-turbo-frame" },
    })
    if (!response.ok || !response.body) return ""

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let html = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (endMarker(html)) {
        void reader.cancel()
        break
      }
    }
    return html
  }

  // resolve truncated file paths by fetching the PR files/changes page and parsing its file tree
  let resolvePromise: Promise<void> | null = null

  const resolveFilePathsFromFilesPage = async (filesPageUrl: string): Promise<void> => {
    if (Object.keys(diffHashToPathCache).length > 0) return // already resolved
    if (resolvePromise) return resolvePromise // dedupe concurrent calls

    resolvePromise = (async () => {
      try {
        const isOldExp = filesPageUrl.includes("/files")
        const isNewExp = filesPageUrl.includes("/changes")

        let html: string
        if (isOldExp && !isNewExp) {
          // old experience: stream until </file-tree> custom element closes
          html = await streamUntil(filesPageUrl, h => h.includes("</file-tree>"))
          const doc = new DOMParser().parseFromString(html, "text/html")
          const fileTree = doc.querySelector("file-tree")
          if (fileTree) buildCacheFromOldFileTree(fileTree)
        } else {
          // new experience (or unknown): stream until diff content starts after file tree
          // tree uses role="treeitem", diffs use role="grid"
          let seenTreeItem = false
          html = await streamUntil(filesPageUrl, h => {
            if (!seenTreeItem && h.includes('role="treeitem"')) seenTreeItem = true
            return seenTreeItem && h.includes('role="grid"')
          })
          const doc = new DOMParser().parseFromString(html, "text/html")
          buildCacheFromNewFileTree(doc)
        }

        debug("Resolved file paths from files page:", diffHashToPathCache)
      } catch (e) {
        debug("Failed to resolve file paths:", e)
      }
    })()

    return resolvePromise
  }

  const addEditorIcons = async () => {
    debug("Adding editor icons")

    let addedIconsCounter = 0

    // -------------------------------
    // repository content (files list)
    // -------------------------------

    if (OPTIONS.showIconInFileTree) {
      const files = document.querySelectorAll(
        '[aria-labelledby="files"].js-navigation-container > .Box-row.js-navigation-item .css-truncate',
      )

      files.forEach(fileElement => {
        // don't add a new icon if icon already exists
        if (fileElement.parentNode?.querySelector(".open-in-ide-icon")) return

        const fileUrl = fileElement.querySelector("a")?.getAttribute("href")
        if (!fileUrl || !filePathRegExp.test(fileUrl)) return

        const pathInfo = filePathRegExp.exec(fileUrl)
        const repo = pathInfo?.[1]
        const file = pathInfo?.[3]
        if (!repo || !file) return

        const editorIconElement = generateIconElement(repo, file)
        editorIconElement.classList.add("open-in-ide-icon-file-explorer")

        fileElement.parentNode?.insertBefore(editorIconElement, fileElement.nextSibling)
        addedIconsCounter++
      })
    }

    // --------------------------------------------
    // file links (files changed view & discussions)
    // --------------------------------------------

    if (OPTIONS.showIconOnFileBlockHeaders || OPTIONS.showIconOnLineNumbers) {
      // detect which view we're in
      const isNewFilesChangedView = !!document.querySelector("#diff-comparison-viewer-container")
      let inFilesChangedView = true

      // select file header links depending on the view
      let primaryLinks: NodeListOf<HTMLAnchorElement>

      if (isNewFilesChangedView) {
        // new experience: file header links inside h3 DiffFileHeader
        primaryLinks = document.querySelectorAll<HTMLAnchorElement>(
          '[class*="Diff-module__diff"] h3[class*="DiffFileHeader"] a.Link--primary',
        )
        // build path cache from the in-page file tree
        if (primaryLinks.length) {
          buildCacheFromNewFileTree(document)
        }
      } else {
        // old experience: file header links with title attribute
        primaryLinks = document.querySelectorAll<HTMLAnchorElement>(".file a.Link--primary[title]")
      }

      if (!primaryLinks.length) {
        // discussion/conversation view
        primaryLinks = document.querySelectorAll<HTMLAnchorElement>(".js-comment-container a.Link--primary.text-mono")
        inFilesChangedView = false
      }

      const repo = window.location.href.split("/")[4]

      // in discussion view, resolve truncated file paths from the files changed page
      if (!inFilesChangedView && primaryLinks.length) {
        // detect if the user has new experience enabled by checking the "Files changed" tab link
        const filesChangedTabLink = document.querySelector<HTMLAnchorElement>('a[href*="/changes"], a[href*="/files"]')
        const tabHref = filesChangedTabLink?.getAttribute("href") ?? ""
        const useNewExp = tabHref.includes("/changes")

        // construct the files page URL from the PR base path
        const prBasePath = window.location.pathname.replace(/\/(files|changes|commits).*/, "")
        const filesPageUrl = useNewExp ? `${prBasePath}/changes` : `${prBasePath}/files`
        await resolveFilePathsFromFilesPage(filesPageUrl)
      }

      primaryLinks.forEach(linkElement => {
        const rawFile = (linkElement.getAttribute("title") ?? linkElement.innerText)
          // strip left-to-right marks inserted by GitHub's new experience
          .replace(/\u200E/g, "")
          .split("→") // when file was renamed
          .pop()
          ?.trim()

        // no file found
        if (!rawFile) return

        // resolve truncated/incomplete paths using the cached diff-hash mapping
        let file = rawFile
        const href = linkElement.getAttribute("href")
        const hash = href?.match(/#(diff-[a-f0-9]+)/)?.[1]
        if (hash && diffHashToPathCache[hash]) {
          file = diffHashToPathCache[hash]
        }

        let lineNumberForFileBlock

        // find the containing file block
        const fileElement = !inFilesChangedView
          ? linkElement.closest(".js-comment-container")
          : isNewFilesChangedView
          ? linkElement.closest('div[id^="diff-"]')
          : linkElement.closest(".file")

        if (fileElement) {
          if (!inFilesChangedView) {
            // in discussion
            const lineNumberNodes = fileElement.querySelectorAll("td[data-line-number]")

            if (lineNumberNodes.length === 0) return // length can be equal to zero in case of resolved comment for example

            // get last line number
            lineNumberForFileBlock = lineNumberNodes[lineNumberNodes.length - 1].getAttribute("data-line-number")
          } else if (isNewFilesChangedView) {
            // new experience: find first addition/deletion code element, then get its row's line number
            const firstChanged = fileElement.querySelector("code.addition, code.deletion")
            const row = firstChanged?.closest("tr")
            const lineNumCell = row?.querySelector("td.new-diff-line-number[data-line-number]")
            lineNumberForFileBlock = lineNumCell?.getAttribute("data-line-number")
          } else {
            // old experience
            const firstLineNumberNode = fileElement.querySelector(
              "td.blob-num-deletion[data-line-number], td.blob-num-addition[data-line-number]",
            )
            lineNumberForFileBlock = firstLineNumberNode?.getAttribute("data-line-number")
          }
        } else {
          // no line number available
        }

        if (
          OPTIONS.showIconOnFileBlockHeaders &&
          // don't add a new icon if icon already exists
          !linkElement.parentNode?.querySelector(".open-in-ide-icon")
        ) {
          const editorIconElement = generateIconElement(repo, file, lineNumberForFileBlock)

          if (isNewFilesChangedView && inFilesChangedView) {
            // new experience files changed: insert into the grandparent flex container (sibling of <h3>)
            // so the icon sits inline in the flex row instead of below the block-level <h3>
            const flexContainer = linkElement.closest('[class*="DiffFileHeader-module__file-path-section"]')
            if (flexContainer && !flexContainer.querySelector(".open-in-ide-icon")) {
              flexContainer.appendChild(editorIconElement)
            }
          } else {
            linkElement.parentNode?.insertBefore(editorIconElement, null)
          }
          addedIconsCounter++
        }

        // add icon on each line number
        if (OPTIONS.showIconOnLineNumbers && fileElement) {
          // support both old (td.blob-num) and new (td.new-diff-line-number) experience
          const clickableLineNumbersNodes = fileElement.querySelectorAll(
            "td.blob-num[data-line-number], td.new-diff-line-number[data-line-number]",
          )

          clickableLineNumbersNodes.forEach(lineNumberNode => {
            // don't add a new icon if icon already exists
            if (lineNumberNode.querySelector(".open-in-ide-icon")) return

            const lineNumber = lineNumberNode.getAttribute("data-line-number")

            const editorIconElement = generateIconElement(repo, file, lineNumber)

            lineNumberNode.classList.add("js-open-in-ide-icon-added")
            lineNumberNode.appendChild(editorIconElement)
            addedIconsCounter++
          })
        }
      })
    }

    debug(`Added ${addedIconsCounter} new editor icons`)
  }

  // observe content changes
  const observeChanges = () => {
    debug("Observing page changes")

    const content = document.querySelector(".repository-content")

    if (content)
      pageChangeObserver.observe(content, {
        childList: true,
        subtree: true,
      })
  }

  // inject CSS rules for GitHub elements
  const styleNode = document.createElement("style")

  if (OPTIONS.showIconOnLineNumbers)
    // hide file numbers on hover to show the IDE icon instead
    styleNode.innerHTML += `tr:hover > td.js-open-in-ide-icon-added::before {
      display: none;
    }
    tr:hover > td.new-diff-line-number.js-open-in-ide-icon-added {
      font-size: 0;
    }
    tr:hover > td.new-diff-line-number.js-open-in-ide-icon-added .open-in-ide-icon {
      font-size: initial;
    }`

  document.head.appendChild(styleNode)

  // set up an observer
  const pageChangeObserver = new MutationObserver(function (mutations) {
    mutations.forEach(
      debounce(function (mutation: MutationRecord) {
        // prevent recursive mutation observation
        if ((mutation.target as Element).querySelector(":scope > .open-in-ide-icon")) return
        debug("Detected page changes:")
        debug(mutation.target)
        void addEditorIcons()
        observeChanges()
      }),
    )
  })

  void addEditorIcons()
  observeChanges()

  // observe route change
  pageChangeObserver.observe(document.head, {
    childList: true,
  })
}

void run()

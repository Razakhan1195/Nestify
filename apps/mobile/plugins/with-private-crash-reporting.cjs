// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo config plugins execute in Node.
const { withAppDelegate, withMainApplication } = require("expo/config-plugins");

const swift = `RNSentrySDK.start { options in
      options.sendDefaultPii = false
      options.maxBreadcrumbs = 0
      options.beforeBreadcrumb = { _ in nil }
      options.beforeSend = { event in
        let clean = Event(level: event.level)
        clean.eventId = event.eventId
        clean.timestamp = event.timestamp
        clean.platform = event.platform
        clean.releaseName = event.releaseName
        clean.dist = event.dist
        clean.environment = event.environment
        clean.debugMeta = event.debugMeta
        let sanitizeStack: (SentryStacktrace?) -> SentryStacktrace? = { stack in
          guard let stack = stack else { return nil }
          let frames = stack.frames.suffix(100).map { source -> Frame in
            let frame = Frame()
            frame.instructionAddress = source.instructionAddress
            frame.imageAddress = source.imageAddress
            frame.symbolAddress = source.symbolAddress
            frame.lineNumber = source.lineNumber
            frame.columnNumber = source.columnNumber
            frame.inApp = source.inApp
            frame.fileName = source.fileName.map { URL(fileURLWithPath: $0.components(separatedBy: "?")[0]).lastPathComponent }
            return frame
          }
          return SentryStacktrace(frames: frames, registers: [:])
        }
        clean.exceptions = event.exceptions?.suffix(5).map { source in
          let exception = Exception(value: "Error details removed for privacy", type: "NativeError")
          exception.threadId = source.threadId
          exception.stacktrace = sanitizeStack(source.stacktrace)
          return exception
        }
        clean.threads = event.threads?.suffix(100).map { source in
          let thread = SentryThread(threadId: source.threadId)
          thread.crashed = source.crashed
          thread.current = source.current
          thread.isMain = source.isMain
          thread.stacktrace = sanitizeStack(source.stacktrace)
          return thread
        }
        clean.stacktrace = sanitizeStack(event.stacktrace)
        return clean
      }
    }`;
const kotlin = `RNSentrySDK.init(this) { options ->
      options.isSendDefaultPii = false
      options.maxBreadcrumbs = 0
      options.setBeforeBreadcrumb { _, _ -> null }
      options.setBeforeSend { event, hint ->
        hint.clearAttachments()
        val clean = io.sentry.SentryEvent()
        clean.eventId = event.eventId
        clean.timestamp = event.timestamp
        clean.level = event.level
        clean.platform = event.platform
        clean.release = event.release
        clean.dist = event.dist
        clean.environment = event.environment
        clean.debugMeta = event.debugMeta
        fun cleanStack(stack: io.sentry.protocol.SentryStackTrace?): io.sentry.protocol.SentryStackTrace? {
          if (stack == null) return null
          val frames = stack.frames?.takeLast(100)?.map { source ->
            io.sentry.protocol.SentryStackFrame().apply {
              instructionAddr = source.instructionAddr
              imageAddr = source.imageAddr
              symbolAddr = source.symbolAddr
              lineno = source.lineno
              colno = source.colno
              isInApp = source.isInApp
              filename = source.filename?.substringBefore("?")?.substringAfterLast("/")
              module = source.module?.takeIf { it.matches(Regex("[a-zA-Z0-9_.$<>-]{1,160}")) }
              function = source.function?.takeIf { it.matches(Regex("[a-zA-Z0-9_.$<>-]{1,160}")) }
            }
          } ?: emptyList()
          return io.sentry.protocol.SentryStackTrace(frames)
        }
        clean.exceptions = event.exceptions?.takeLast(5)?.map { source ->
          io.sentry.protocol.SentryException().apply {
            type = "NativeError"
            value = "Error details removed for privacy"
            threadId = source.threadId
            stacktrace = cleanStack(source.stacktrace)
          }
        }
        clean.threads = event.threads?.takeLast(100)?.map { source ->
          io.sentry.protocol.SentryThread().apply {
            id = source.id
            isCrashed = source.isCrashed
            isCurrent = source.isCurrent
            stacktrace = cleanStack(source.stacktrace)
          }
        }
        clean
      }
    }`;
function patch(source, needle, replacement) {
  if (source.includes("Error details removed for privacy")) return source;
  if (!source.includes(needle)) throw Error("Native crash initialization was not found; refusing an unscrubbed build.");
  return source.replace(needle, replacement);
}
function withPrivateCrashReporting(config) {
  config = withAppDelegate(config, mod => {
    if (mod.modResults.language !== "swift") throw Error("Unsupported iOS crash initialization language.");
    mod.modResults.contents = patch(mod.modResults.contents, "RNSentrySDK.start()", swift);
    if (!mod.modResults.contents.includes("import Sentry\n")) mod.modResults.contents = "import Sentry\n" + mod.modResults.contents;
    return mod;
  });
  return withMainApplication(config, mod => {
    if (mod.modResults.language !== "kt") throw Error("Unsupported Android crash initialization language.");
    mod.modResults.contents = patch(mod.modResults.contents, "RNSentrySDK.init(this)", kotlin);
    return mod;
  });
}
module.exports = withPrivateCrashReporting;
module.exports.patch = patch;
module.exports.swift = swift;
module.exports.kotlin = kotlin;

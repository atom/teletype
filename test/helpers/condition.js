module.exports = function condition (fn, shouldLog = false) {
  const timeoutError = new Error('Condition timed out: ' + fn.toString())
  Error.captureStackTrace(timeoutError, condition)

  return new Promise((resolve, reject) => {
    const intervalId = global.setInterval(async () => {
      let result = fn()
      if (result instanceof Promise) {
        result = await result
      }

      if (result) {
        if (shouldLog) {
          console.log('I got here');
        }
        global.clearTimeout(timeout)
        global.clearInterval(intervalId)
        if (shouldLog) {
          console.log('I got here and resolved');
        }
        resolve()
      }
    }, 5)

    const timeout = global.setTimeout(() => {
      global.clearInterval(intervalId)
      reject(timeoutError)
    }, 500)
  })
}

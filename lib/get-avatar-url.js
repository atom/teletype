module.exports = function (login, size) {
  let url = `https://avatars.githubusercontent.com/${login}`
  if (size) url += `?s=${size}`

  return url
}

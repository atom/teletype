#!/usr/bin/env node
const https = require('https')

printLastAtomMasterArtifactURL()

async function printLastAtomMasterArtifactURL () {
  const recentBuilds = await get('/api/v1.1/project/github/atom/atom/tree/master')
  const mostRecentBuild = recentBuilds[0]
  const successfulBuildNumber = (mostRecentBuild.outcome === 'success')
    ? mostRecentBuild.build_num
    : mostRecentBuild.previous_successful_build.build_num

  const artifacts = await get(`/api/v1.1/project/github/atom/atom/${successfulBuildNumber}/artifacts`)
  const atomZipArtifact = artifacts.find((a) => a.path.endsWith('atom-mac.zip'))
  console.log(atomZipArtifact.url)
}

function get (path) {
  return new Promise((resolve, reject) => {
    const request = https.get({host: 'circleci.com', path, headers: {'Accept': 'application/json'}}, (response) => {
      let body = ''
      response.on('data', (d) => { body += d })
      response.on('end', () => {
        resolve(JSON.parse(body))
      })
    })
    request.on('error', reject)
    request.end()
  })
}

const core = require("@actions/core")
const github = require("@actions/github")

const octokit = new github.GitHub(process.env.GITHUB_TOKEN)
const context = github.context

const { owner, repo } = context.repo
const event_type = context.eventName

let issue_pr_number

// most @actions toolkit packages have async methods
async function run() {
  try {
    console.log(`Default configured filesizelimit is set to ${fsl} bytes...`)
    console.log(`Name of Repository is ${repo} and the owner is ${owner}`)
    console.log(`Triggered event is ${event_type}`)

    // Get LFS Warning Label
    let lfslabel = await octokit.issues.getLabel({
      owner,
      repo,
      name: ":warning: lfs-detected!"
    })

    console.log(`Repo has lfs warning label - ${lfslabel}`)

    if (lfslabel === undefined) {
      await octokit.issues.createLabel({
        owner,
        repo,
        name: ":warning: lfs-detected!",
        color: "ffcf00",
        description:
          "Warning Label for use when LFS is detected in the commits of a Pull Request"
      })

      console.log(`No lfs warning label detected. Creating new label ...`)
      console.log(`LFS warning label created`)
    }

    // Get List of files for Pull Request
    const fsl = core.getInput("filesizelimit")

    if (event_type === "pull_request") {
      issue_pr_number = context.payload.pull_request.number

      console.log(`The PR number is: ${issue_pr_number}`)

      const { data: pullRequest } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: issue_pr_number
      })
      console.log("Before Getting Size Property") // for debug - remove for production
      console.log(pullRequest)  // for debug - remove for production

      let newPRobj
      let prFilesWithBlobSize = await Promise.all(
        pullRequest.map(async function(item) {
          const { data: prFilesBlobs } = await octokit.git.getBlob({
            owner,
            repo,
            file_sha: item.sha
          })

          newPRobj = {
            filename: item.filename,
            filesha: item.sha,
            fileblobsize: prFilesBlobs.size
          }

          return newPRobj
        })
      )

      console.log("After Getting Size Property")  // for debug - remove for production
      console.log(prFilesWithBlobSize)  // for debug - remove for production

      let lfsFile = []
      for (let prop in prFilesWithBlobSize) {
        if (prFilesWithBlobSize[prop].fileblobsize > fsl) {
          lfsFile.push(prFilesWithBlobSize[prop].filename)
        }
      }

      if (lfsFile.length > 0) {
        
        console.log("Detected large file(s):")
        console.log(lfsFile)

        lfsFile.join("\n")
        let bodyTemplate = `## :warning: Possible large file(s) detected :warning: \n
        The following file(s) exceeds the file size limit: ${fsl} bytes, as set in the .yml configuration files
        
        ${lfsFile.toString()}`

        await octokit.issues.createComment({
          owner,
          repo,
          issue_number: issue_pr_number,
          body: bodyTemplate
        })
      } else {

        console.log("No large file(s) detected...")

      }

      // TODO:

      // logic to add lfs-file warning label in Pr
      // logic to set PR status as failed

      // git lfs attributes misconfiguration lfs watch dog logic
      
    } else {
      console.log(`No Pull Request detected. Skipping LFS warning check`)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()

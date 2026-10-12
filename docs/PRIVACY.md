# GratisStatt Privacy Policy

Last updated: October 12, 2026 (version 2: reviews)

## Who is responsible?

GratisStatt is a **private fun project** by [@tmluc-cool](https://github.com/tmluc-cool) – not a company and not a commercial service.
Contact: through the [issues in the project repo](https://github.com/tmluc-cool/githuub-appstore/issues).

You use the app at your own risk. No liability whatsoever is accepted.

## In short

- GratisStatt works **without signing in** and stores everything **locally on your computer**.
- Without the network, the app **only talks to GitHub**. There are no ads, no trackers, no analytics and no crash reports.
- The **GratisStatt network is optional** and turned off by default. Only when you choose "Join" and sign in with GitHub does the app send data to our server.

## What happens without the network?

Once a week, the app downloads an update package from GitHub (github.com, public repository "gratisstatt-data"). For the live search and the manual update, the app talks directly to GitHub. It opens projects in your browser. GitHub's privacy policy applies to all of this. We receive nothing from it.

On your computer, the app stores a database with public information about GitHub projects (name, description, stars, etc.), your settings and – if you enter one – your GitHub token in encrypted form.

## What data do we store if you join the network?

| Data | What for |
| --- | --- |
| GitHub ID and GitHub username | to recognize you as a member |
| App version | to see which versions are still in use |
| Day you joined and last active day (date only, no time) | to delete inactive members automatically |
| Number of contributions and the IDs of the GitHub projects you suggested | to check the suggestions and add them to the next update |
| Your reviews (stars, text, date) and replies as a project owner | so that others can read them – **public, with your GitHub username** |
| Which reviews you upvoted | so that each person can vote only once – only the number of votes is published, not who voted |

**Not stored:** email address, IP address, search terms, device IDs, files on your computer. We check your GitHub token one single time when you sign in and do not store it.

## Reviews

- Only network members can write, upvote and reply to reviews. **Anyone can read them.**
- Once a week, all reviews are written, together with your GitHub username, into the public update package on GitHub (repository "gratisstatt-data", latest release). This way all users get them without talking to our server. We remove older copies from earlier releases.
- When you reply, the server checks one single time with GitHub, using your GitHub token, whether you are the owner of the project. It does not store the token.
- You can change or delete your own review at any time. Deleted reviews also disappear for everyone else with the next weekly update.
- We can hide or delete reviews, for example in case of spam or insults.

## Where is the data stored?

At Cloudflare (Cloudflare Workers and Cloudflare D1). We have turned off permanent logs.

## For how long?

Until you leave the network – or automatically after **12 months without activity**.

## Your rights: view and delete

- **View:** Settings → Network → "Show my stored data" shows exactly what the server knows about you.
- **Delete:** Settings → Network → turn off the "Join" switch → "Leave and delete data". Your account, your open suggestions, your reviews, upvotes and replies are deleted from the server immediately and, with the next weekly update, also disappear from everyone else's app.
- For any other questions, please use the contact address above.

## Changes

If this policy changes significantly, the app asks all network members for their consent again.

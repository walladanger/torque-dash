# Installation and Logging Data

## Installation With Heroku

1. Create a fork of the repo.
2. Create a new app in Heroku with a postgres addon
3. Enable GitHub integration for deployment and connect the forked repo to your app ([More info](https://devcenter.heroku.com/articles/github-integration))
4. Deploy the application from heroku.

## Logging data

To be able to log data from Torque Pro:

1. Register an account in torqueDASH
2. In Torque Pro settings set the user email address to the same as your accounts.
3. In Torque Pro settings set the Webserver URL to the */api/upload* path

```text
https://yourappname.herokuapp.com/api/upload
```

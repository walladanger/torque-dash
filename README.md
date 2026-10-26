# torque-dash

A web application for uploading and presenting real-time diagnostic automobile data (OBD2) logged by Torque android app.

![License](https://img.shields.io/github/license/walladanger/torque-dash)

![Map View](imgs/mapview.png)

## Features

- Filterable table with a list of all logged sessions
- Export session data to CSV
- Edit sessions by renaming, adding start/end locations, copying, or deleting
- Merge multiple sessions together or cut out parts of a session
- Graphical representation of the logged ride on a map with a heatline
- Line chart for PID values and display of live data for ongoing sessions
- Share logged data with public URLs or forward requests to other servers

## Architecture

```mermaid
flowchart TD
  routes --> controllers
  controllers --> models
  controllers --> views
```

The application uses Express routes in the `routes` directory to direct incoming requests to the `controllers`. The controllers interact with the PostgreSQL database through Sequelize `models` and render the user interface using Handlebars templates in the `views` directory.

## Quick start

To run this application locally, you will need Node.js and a PostgreSQL database.

```sh
npm install
npm start
npm test
```

For Heroku deployment and instructions on logging data from the Torque app, see [docs/setup.md](docs/setup.md).

## Configuration

| Name | Purpose | Default |
| --- | --- | --- |
| `PORT` | The port the application runs on | `3000` |
| `DATABASE_URL` | Postgres database connection URI | `postgres://postgres:heslo@localhost:5432/torquedash` |
| `SESSION_KEYS` | Keys for cookie-session middleware | `['6a5w4d65a4wd', 'a65w4d6aw4d89a4', '65f4b8b4szd8']` |

## Screenshots

![Editing](imgs/editing.gif)

![Share](imgs/share.png)

## Roadmap

See issues.

## License & credits

Distributed under the MIT License. See [LICENSE.txt](LICENSE.txt) for more information.

Based on davekrejci/torque-dash.

Please confirm receipt of this take-home exam. You have 2 hours to complete it, from 10am EST to 12pm EST.

Hi Austin,

You'll build a lightweight task management app with the following features:
- A Python or Node.js based backend (libraries like Express and FastAPI allowed) that supports task creation, completion, deletion, and statistics
- A TypeScript React frontend that interacts with the backend API
- A Dockerized environment that allows everything to be run via docker-compose

These are Minimum Requirements. Try to impress us with the backend, frontend and additional features.

---

Requirements

1. Backend

Build a RESTful API with the following endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /tasks | List all tasks |
| POST | /tasks | Create a task |
| GET | /tasks/<id> | Get task detail |
| PUT | /tasks/<id>/complete | Mark a task as completed |
| DELETE | /tasks/<id> | Delete a task |
| GET | /tasks/stats | Return stats (total, completed, pending) |
| GET | /tasks/<id>/activity | Return activity log entries for that task |
| POST | /auth/login | Login |

Task fields:
{
  "id": int or string,
  "title": string,
  "completed": boolean
}

Notes:
- Tasks can be stored in memory (e.g., an in-memory map or list). No database is required.
- Validate incoming requests and return appropriate error messages (e.g., 404 on missing ID).
- Port: expose the app on port 3001 in Docker.

---

2. Frontend (TypeScript React)

Create a web UI with the following:

Login Page
- Email and password inputs
- Call /auth/login
- Return a token and save it
- Redirect to task list
- Show error for invalid credentials

Task List Page
- Display paginated list of tasks with title and completed status
- Next and previous pagination controls
- Form/input to add a new task
- Buttons to edit, toggle completed, and delete
- Visible statistics section: Total tasks, Completed tasks, Pending tasks (fetched from /tasks/stats)
- Clicking a task opens the task detail page
- Show loading and error states

Task Detail Page
- Show title
- Show completed status
- Show created time
- Allow editing title
- Allow toggling completed
- Allow deleting the task
- Show activity log (from /tasks/<id>/activity)
- Each entry shows timestamp, old status, new status
- Update UI after edits

Notes:
- Use React Router for navigation
- API requests must include login auth validation
- Expose the frontend on port 3000 with Docker

---

3. Dockerization

Package both backend and frontend using Docker:
- Include a Dockerfile for the backend
- Include a Dockerfile for the frontend
- Include a working docker-compose.yml that:
  - Builds both services
  - Ensures the frontend can communicate with the backend
  - Allows the app to be run with: docker-compose up --build

---

Sample API Usage

# Add a task
curl -X POST http://localhost:5000/tasks -H "Content-Type: application/json" -d '{"title": "Write report"}'

# List tasks
curl http://localhost:5000/tasks

# Mark a task as complete
curl -X PUT http://localhost:5000/tasks/1/complete

# Delete a task
curl -X DELETE http://localhost:5000/tasks/1

# Get stats
curl http://localhost:5000/tasks/stats

---

Deliverables

Please submit either:
- A GitHub repo (public or private with access), OR
- A ZIP file containing:
  - backend/ with src code and Dockerfile
  - frontend/ with your frontend code and Dockerfile
  - A top-level docker-compose.yml
  - A README.md with:
    - How to build and run the app
    - Any assumptions or simplifications you made
    - Answers to these brief questions:
      - How did you handle API errors?
      - What tests would you write if given more time?
      - What would you improve with 1 extra hour?

---

Optional

Feel free to include one or two example tests (unit or integration) to show how you'd approach testing the API. Totally optional, but appreciated.

---

Time Expectation

This challenge is scoped for ~2 hours of work. Don't worry about polish or perfect structure — we're more interested in how you approach problems and structure code.
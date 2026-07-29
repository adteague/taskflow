"""Pydantic schemas. All request/response bodies use camelCase JSON aliases."""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, field_validator, model_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base model: camelCase aliases on the wire, snake_case in Python.

    from_attributes lets us validate directly from store dataclass records.
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


# --- Auth ---


class LoginRequest(CamelModel):
    email: str
    password: str


class UserOut(CamelModel):
    email: str


class LoginResponse(CamelModel):
    token: str
    user: UserOut


# --- Tasks ---


def _validate_title(value: str) -> str:
    value = value.strip()
    if not 1 <= len(value) <= 200:
        raise ValueError("title must be between 1 and 200 characters after trimming")
    return value


TaskStatus = Literal["backlog", "todo", "in_progress", "complete"]


class Task(CamelModel):
    id: int
    title: str
    completed: bool
    status: TaskStatus
    created_at: datetime
    updated_at: datetime


class TaskCreate(CamelModel):
    title: str

    @field_validator("title")
    @classmethod
    def check_title(cls, value: str) -> str:
        return _validate_title(value)


class TaskUpdate(CamelModel):
    title: Optional[str] = None
    completed: Optional[bool] = None
    status: Optional[TaskStatus] = None

    @field_validator("title")
    @classmethod
    def check_title(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return _validate_title(value)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "TaskUpdate":
        if self.title is None and self.completed is None and self.status is None:
            raise ValueError(
                "at least one of 'title', 'completed', or 'status' is required"
            )
        return self


class TaskListResponse(CamelModel):
    items: list[Task]
    total: int
    page: int
    limit: int
    total_pages: int


class TaskStats(CamelModel):
    # The spec'd trio; "pending" = anything not complete.
    total: int
    completed: int
    pending: int
    # Per-status breakdown (in_progress serializes as inProgress).
    backlog: int
    todo: int
    in_progress: int


class ActivityEntry(CamelModel):
    id: int
    task_id: int
    timestamp: datetime
    action: Literal["created", "title_changed", "status_changed"]
    old_value: Optional[str]
    new_value: Optional[str]

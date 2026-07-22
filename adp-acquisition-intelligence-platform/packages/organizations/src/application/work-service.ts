import { AppError } from '@adp/platform';

import type {
  NoteRepository,
  TagRepository,
  TaskRepository,
} from '../domain/ports.js';
import type { Note, SubjectType, Tag, Task } from '../domain/types.js';

function notFound(resource: string, id: string): AppError {
  return new AppError({ code: 'NOT_FOUND', message: `${resource} not found`, details: { id } });
}

function assertNonBlank(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new AppError({ code: 'VALIDATION_FAILED', message: `${field} must not be blank` });
  }
}

export class TaskService {
  constructor(private readonly tasks: TaskRepository) {}

  async create(input: Parameters<TaskRepository['create']>[0]): Promise<Task> {
    assertNonBlank(input.title, 'title');
    if (input.priority < 0) {
      throw new AppError({ code: 'VALIDATION_FAILED', message: 'priority must be non-negative' });
    }
    return this.tasks.create(input);
  }

  async updateStatus(command: {
    taskId: string;
    status: Task['status'];
    updatedByUserId: string | null;
    at?: Date;
  }): Promise<Task> {
    const task = await this.tasks.findById(command.taskId);
    if (task === null) throw notFound('Task', command.taskId);
    if (task.archivedAt !== null) {
      throw new AppError({ code: 'CONFLICT', message: 'Task is archived', details: { id: command.taskId } });
    }
    const updated = await this.tasks.updateStatus(
      command.taskId,
      command.status,
      command.updatedByUserId,
      command.at ?? new Date(),
    );
    if (updated === null) throw notFound('Task', command.taskId);
    return updated;
  }

  async archive(taskId: string, updatedByUserId: string | null, at = new Date()): Promise<Task> {
    const task = await this.tasks.archive(taskId, updatedByUserId, at);
    if (task === null) throw notFound('Task', taskId);
    return task;
  }
}

export class NoteService {
  constructor(private readonly notes: NoteRepository) {}

  async create(input: Parameters<NoteRepository['create']>[0]): Promise<Note> {
    assertNonBlank(input.body, 'body');
    return this.notes.create(input);
  }

  async archive(noteId: string, updatedByUserId: string | null, at = new Date()): Promise<Note> {
    const note = await this.notes.archive(noteId, updatedByUserId, at);
    if (note === null) throw notFound('Note', noteId);
    return note;
  }
}

export class TagService {
  constructor(private readonly tags: TagRepository) {}

  async create(input: Parameters<TagRepository['create']>[0]): Promise<Tag> {
    assertNonBlank(input.key, 'key');
    assertNonBlank(input.name, 'name');
    return this.tags.create(input);
  }

  async retire(tagId: string, at = new Date()): Promise<Tag> {
    const tag = await this.tags.retire(tagId, at);
    if (tag === null) throw notFound('Tag', tagId);
    return tag;
  }

  async tagSubject(command: {
    tagId: string;
    subjectType: SubjectType;
    subjectId: string;
    createdByUserId: string | null;
  }): Promise<void> {
    const tag = await this.tags.findById(command.tagId);
    if (tag === null) throw notFound('Tag', command.tagId);
    if (tag.status === 'retired') {
      throw new AppError({ code: 'CONFLICT', message: 'Cannot apply a retired tag' });
    }
    await this.tags.tagSubject(
      command.tagId,
      command.subjectType,
      command.subjectId,
      command.createdByUserId,
    );
  }
}

export const TODO_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
}

export interface TodoItem {
  id?: string;
  text: string;
  status: (typeof TODO_STATUS)[keyof typeof TODO_STATUS];
}

export type TodoItems = Array<TodoItem>;

/**
 * @description 任务管理器，用于管理任务列表
 */
class TodoManager {
  items: TodoItems = [];

  constructor(items: TodoItems = []) {
    this.items = items;
  }

  update(items: TodoItems) {
    if(items.length > 20) {
      throw new Error('Max 20 todos allowed');
    }
    const validated = []; // 验证后的任务列表
    let in_progress_count = 0;
    for(const item of items) {
      const text = String(item?.text || '').trim();
      const status = String(item?.status || TODO_STATUS.PENDING).toLowerCase();
      if(!text) {
        throw new Error('Text is required');
      }
      if(!Object.values(TODO_STATUS).includes(status)) {
        throw new Error('Invalid status');
      }
      if(status === TODO_STATUS.IN_PROGRESS) {
        in_progress_count++;
      }
      validated.push({
        id: item?.id,
        text,
        status,
      });
    }
    if(in_progress_count > 1) {
      throw new Error('Only one task can be in_progress at a time'); // 同一时间只能有一个任务处于 in_progress 状态
    }
    this.items = validated;
    return this.render();
  }

  render() {
    if(this.items.length === 0) {
      return 'No todo.';
    }
    const lines = [];
    const statusMarkerMap = {
      [TODO_STATUS.PENDING]: '[pending]',
      [TODO_STATUS.IN_PROGRESS]: '[in_progress]',
      [TODO_STATUS.COMPLETED]: '[completed]',
    };
    for(const item of this.items) {
      if(!lines.length) {
        lines.push('\n<<===Todos: ');
      }
      lines.push(`${statusMarkerMap[item.status]}: ${item.text}`);
    }
    const done = this.items.filter(item => item.status === TODO_STATUS.COMPLETED).length;
    lines.push(`(${done}/${this.items.length} completed)`);
    return lines.join('\n');
  }
}

export default TodoManager;

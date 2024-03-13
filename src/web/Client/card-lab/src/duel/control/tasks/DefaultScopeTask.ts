import {GameTask} from "src/duel/control/task.ts";

export class DefaultScopeTask extends GameTask {
    constructor(public scopeType: string,
                public preparationTasks: (GameTask | null)[] = [],
                public childTasks: (GameTask | null)[] = []) {
        super();
    }

    *run() {
        for (const task of this.preparationTasks) {
            if (task)
                yield task;
        }
        for (const task of this.childTasks) {
            if (task)
                yield task;
        }
    }

    toString(): string {
        return `DefaultScopeTask(${this.scopeType})`;
    }
}
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Link } from '@tiptap/extension-link';
import type { Extension } from '@tiptap/react';

export const gfmExtensions: Extension[] = [
  Table.configure({ resizable: false }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Link.configure({
    openOnClick: false, // handled by LinkResolver
    autolink: true,
    linkOnPaste: true,
  }),
] as unknown as Extension[];

/**
 * Görev ve liste eylemleri + bildirimleri. İlke: onaysız yıkıcı işlem yok, her şey geri alınabilir.
 * Silme anında yapılır ve "Geri al" düğmeli bildirim çıkar; geri alınmazsa "Son silinenler"den geri getirilir.
 *
 * KOPYALA-UYARLA: yeni bir varlığın eylemlerini yazarken bu dosyayı örnek alın (useWrite + useToast).
 */
import { useMemo } from 'react'
import { t } from '../../i18n/index.ts'
import { errorMessage } from '../../lib/errors.ts'
import { useWrite } from '../../lib/store/hooks.ts'
import { useToast } from '../../ui/index.ts'
import type { Task, TaskList } from './logic.ts'

export function useTaskActions() {
  const tasks = useWrite('tasks')
  const lists = useWrite('lists')
  const toast = useToast()

  return useMemo(() => {
    const fail = (error: unknown): void => {
      toast.show({ message: errorMessage(error), tone: 'error' })
    }
    return {
      toggleDone: async (task: Task) => {
        try {
          await tasks.update(task.id, { done: !task.data.done })
        } catch (error) {
          fail(error)
        }
      },
      setOrder: async (task: Task, order: number) => {
        try {
          await tasks.update(task.id, { order })
        } catch (error) {
          fail(error)
        }
      },
      removeTask: async (task: Task) => {
        try {
          await tasks.remove(task.id)
          toast.show({
            message: t('tasks.deleted', { title: task.data.title }),
            action: { label: t('common.undo'), onAction: () => tasks.restore(task.id).catch(fail) },
          })
        } catch (error) {
          fail(error)
        }
      },
      restoreTask: async (task: Task) => {
        try {
          await tasks.restore(task.id)
          toast.show({ message: t('tasks.restored', { title: task.data.title }), tone: 'success' })
        } catch (error) {
          fail(error)
        }
      },
      removeList: async (list: TaskList) => {
        try {
          await lists.remove(list.id)
          toast.show({
            message: t('lists.deleted', { name: list.data.name }),
            action: { label: t('common.undo'), onAction: () => lists.restore(list.id).catch(fail) },
          })
        } catch (error) {
          fail(error)
        }
      },
      restoreList: async (list: TaskList) => {
        try {
          await lists.restore(list.id)
          toast.show({ message: t('lists.restored', { name: list.data.name }), tone: 'success' })
        } catch (error) {
          fail(error)
        }
      },
      setListOrder: async (list: TaskList, order: number) => {
        try {
          await lists.update(list.id, { order })
        } catch (error) {
          fail(error)
        }
      },
    }
  }, [tasks, lists, toast])
}

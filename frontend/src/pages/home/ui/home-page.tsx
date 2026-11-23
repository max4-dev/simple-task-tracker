"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Check, Ellipsis, Plus, Info, Trash2 } from "lucide-react";

import { BRANDING } from "@/shared/config";

import {
  Logo,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/shared/ui";

const priorities = [
  { value: "low", label: "Низкий" },
  { value: "normal", label: "Обычный" },
  { value: "high", label: "Высокий" },
];

function Section({ title, description, children }: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
    </Card>
  );
}

export function HomePage() {
  const [notice, setNotice] = useState("Здесь появится результат действия.");
  const [completed, setCompleted] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("Собрать базовые компоненты");
  const [draftTitle, setDraftTitle] = useState("");

  function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title) return;
    setTaskTitle(title);
    setCompleted(false);
    setNotice(`Создана демозадача «${title}».`);
    setDraftTitle("");
    setDialogOpen(false);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-10 sm:py-16">
      <header className="mb-10 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Logo className="size-4" />
          <span>{BRANDING.NAME}</span>
          <span aria-hidden="true">/</span>
          <span>Компоненты</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl space-y-3">
            <Badge variant="secondary">Основа интерфейса</Badge>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Просто нужные вещи.</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Кнопки, поля и небольшие детали будущего таск-трекера.
              Всё можно попробовать прямо здесь.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button />}>
              <Plus data-icon="inline-start" /> Новая задача
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={createTask} className="space-y-6">
                <DialogHeader>
                  <DialogTitle>Новая задача</DialogTitle>
                  <DialogDescription>
                    Демо: задача появится в примере карточки до перезагрузки страницы.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                  <Label htmlFor="new-task-title">Название</Label>
                  <Input id="new-task-title" placeholder="Что нужно сделать?" required
                    value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} />
                </div>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Отмена</DialogClose>
                  <Button type="submit" disabled={!draftTitle.trim()}>Создать задачу</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Tabs defaultValue="components" className="gap-6">
        <TabsList variant="line" aria-label="Примеры интерфейса">
          <TabsTrigger value="components">Компоненты</TabsTrigger>
          <TabsTrigger value="preview">Пример задачи</TabsTrigger>
        </TabsList>

        <TabsContent value="components">
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Кнопки" description="Основные действия, варианты и размеры.">
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setNotice("Изменения сохранены в демо.")}><Plus data-icon="inline-start" />Основная</Button>
                <Button variant="secondary" onClick={() => setNotice("Выбрана вторичная кнопка.")}>Вторичная</Button>
                <Button variant="outline" onClick={() => setNotice("Выбрана контурная кнопка.")}>Контурная</Button>
                <Button variant="ghost" onClick={() => setNotice("Выбрана прозрачная кнопка.")}>Прозрачная</Button>
                <Button variant="destructive" onClick={() => setNotice("Нажата кнопка удаления в демо.")}><Trash2 />Удалить</Button>
                <Button variant="link" onClick={() => setNotice("Выбрана кнопка-ссылка.")}>Ссылка</Button>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs" variant="outline" onClick={() => setNotice("Размер XS.")}>XS</Button>
                <Button size="sm" variant="outline" onClick={() => setNotice("Размер S.")}>Маленькая</Button>
                <Button size="lg" variant="outline" onClick={() => setNotice("Размер L.")}>Большая</Button>
                <Tooltip>
                  <TooltipTrigger render={<Button size="icon" variant="outline" aria-label="Добавить задачу" onClick={() => setDialogOpen(true)} />}>
                    <Plus />
                  </TooltipTrigger>
                  <TooltipContent>Добавить задачу</TooltipContent>
                </Tooltip>
                <Button disabled>Недоступна</Button>
              </div>
            </Section>

            <Section title="Поля ввода" description="Подписи, подсказки и состояния полей.">
              <div className="space-y-2">
                <Label htmlFor="task-name">Название задачи</Label>
                <Input id="task-name" placeholder="Например, набросать первый экран" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-description">Описание</Label>
                <Textarea id="task-description" placeholder="Пара слов о задаче…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="invalid-input">С ошибкой</Label>
                  <Input id="invalid-input" aria-invalid="true" aria-describedby="input-error" defaultValue="" placeholder="Обязательное поле" />
                  <p id="input-error" className="text-xs text-destructive">Укажите название задачи.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="disabled-input">Недоступное поле</Label>
                  <Input id="disabled-input" disabled placeholder="Только для просмотра" />
                </div>
              </div>
            </Section>

            <Section title="Выбор и переключение" description="Приоритет, выполнение и настройки.">
              <div className="space-y-2">
                <Label htmlFor="priority">Приоритет</Label>
                <Select items={priorities} defaultValue="normal">
                  <SelectTrigger id="priority" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {priorities.map((priority) => <SelectItem key={priority.value} value={priority.value}>{priority.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="completed" checked={completed} onCheckedChange={setCompleted} />
                <Label htmlFor="completed">Задача выполнена</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="disabled-checkbox" disabled />
                <Label htmlFor="disabled-checkbox">Недоступный вариант</Label>
              </div>
              <Separator />
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="notifications">Уведомления о задачах</Label>
                <Switch id="notifications" checked={notifications} onCheckedChange={setNotifications} />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="disabled-switch">Недоступная настройка</Label>
                <Switch id="disabled-switch" disabled size="sm" />
              </div>
            </Section>

            <Section title="Детали интерфейса" description="Метки, меню действий и состояние загрузки.">
              <div className="flex flex-wrap gap-2">
                <Badge>В работе</Badge>
                <Badge variant="secondary">Запланировано</Badge>
                <Badge variant="outline"><Check />Готово</Badge>
                <Badge variant="destructive">Просрочено</Badge>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border p-3">
                <span className="text-sm">Действия с задачей</span>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label="Действия с задачей" />}><Ellipsis /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { setCompleted(true); setNotice("Демозадача выполнена."); }}><Check />Завершить</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDialogOpen(true)}><Plus />Создать новую</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem disabled>Переместить в проект</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Separator />
              <div className="space-y-3" role="status" aria-label="Пример загрузки задачи">
                <p className="text-xs text-muted-foreground">Пример загрузки</p>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-lg" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
                </div>
              </div>
            </Section>
          </div>
        </TabsContent>

        <TabsContent value="preview">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle>Одна задача. Всё под рукой.</CardTitle>
              <CardDescription>Пример совместного использования компонентов. Данные хранятся только на этой странице.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex items-start gap-3">
                <Checkbox id="preview-completed" className="mt-1" checked={completed} onCheckedChange={setCompleted} />
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor="preview-completed" className={`break-words leading-6 ${completed ? "text-muted-foreground line-through" : ""}`}>{taskTitle}</Label>
                  <p className="text-sm text-muted-foreground">Первый шаг к простому и удобному рабочему пространству.</p>
                </div>
              </div>
              <Separator />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Badge variant={completed ? "secondary" : "outline"}>{completed ? "Готово" : "В работе"}</Badge>
                <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}><Plus />Новая задача</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <footer className="mt-8 flex items-start gap-2 text-sm text-muted-foreground" role="status" aria-live="polite">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>{notice}</p>
      </footer>
    </main>
  );
}

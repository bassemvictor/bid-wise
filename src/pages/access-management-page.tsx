import { useEffect, useMemo, useState } from "react";

import type {
  AccessManagementGroup,
  AccessManagementMe,
  AccessManagementUpdateGroupsRequest,
  AccessManagementUser,
  AppCognitoGroup,
} from "../../shared/types";
import { EmptyState } from "../components/master-data/empty-state";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Dialog } from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { api, isApiConfigured } from "../lib/api";
import { canManageAccess, formatGroupLabel, useAuth } from "../lib/auth";

const groupDescriptionMap: Record<AppCognitoGroup, string> = {
  sales_engineer: "Can work on sales engineering flows.",
  sales_manager: "Can oversee sales management workflows.",
  pricing_engineer: "Can work on pricing and costing workflows.",
  admin: "Can manage users and access.",
  super_user: "Has elevated access management privileges.",
};

type FeedbackState = {
  type: "success" | "error";
  message: string;
};

export const AccessManagementPage = () => {
  const { user, refreshUser } = useAuth();
  const [records, setRecords] = useState<AccessManagementUser[]>([]);
  const [groups, setGroups] = useState<AccessManagementGroup[]>([]);
  const [me, setMe] = useState<AccessManagementMe | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccessManagementUser | null>(null);
  const [selectedGroups, setSelectedGroups] = useState<AppCognitoGroup[]>([]);

  const load = async (clearFeedback = true) => {
    if (!isApiConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    if (clearFeedback) {
      setFeedback(null);
    }

    try {
      const [usersResponse, groupsResponse, meResponse] = await Promise.all([
        api.get<AccessManagementUser[]>("/access-management/users"),
        api.get<AccessManagementGroup[]>("/access-management/groups"),
        api.get<AccessManagementMe>("/access-management/me"),
      ]);
      setRecords(usersResponse);
      setGroups(groupsResponse);
      setMe(meResponse);
    } catch (reason) {
      setFeedback({
        type: "error",
        message: reason instanceof Error ? reason.message : "Unable to load access management.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return records;
    }

    return records.filter((record) =>
      [
        record.name,
        record.email,
        record.username,
        record.groups.map((group) => formatGroupLabel(group)).join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [records, search]);

  const openEditor = (record: AccessManagementUser) => {
    setEditing(record);
    setSelectedGroups(record.groups);
    setFeedback(null);
    setOpen(true);
  };

  const toggleGroup = (group: AppCognitoGroup, checked: boolean) => {
    setSelectedGroups((current) =>
      checked ? Array.from(new Set([...current, group])) : current.filter((entry) => entry !== group),
    );
  };

  const saveGroups = async () => {
    if (!editing) {
      return;
    }

    const removedGroups = editing.groups.filter((group) => !selectedGroups.includes(group));
    if (removedGroups.length > 0) {
      const confirmed = window.confirm(
        `Remove ${editing.username} from ${removedGroups.map((group) => formatGroupLabel(group)).join(", ")}?`,
      );
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setFeedback(null);

    try {
      await api.post<AccessManagementUser>(
        `/access-management/users/${encodeURIComponent(editing.username)}/groups`,
        { groups: selectedGroups } satisfies AccessManagementUpdateGroupsRequest,
      );
      await load(false);
      await refreshUser();
      setOpen(false);
      setFeedback({
        type: "success",
        message: `Updated group membership for ${editing.username}.`,
      });
    } catch (reason) {
      setFeedback({
        type: "error",
        message: reason instanceof Error ? reason.message : "Unable to update group membership.",
      });
    } finally {
      setSaving(false);
    }
  };

  const isCurrentUserRow = (record: AccessManagementUser) =>
    record.username === user?.username || record.username === me?.username;

  if (!canManageAccess(user?.groups ?? [])) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Access Management</CardTitle>
            <CardDescription>Only admins and super users can access this area.</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Access Management</CardTitle>
            <CardDescription>
              Manage Cognito group membership. Users can belong to multiple groups at the same time.
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Input
              className="w-full min-w-[260px]"
              placeholder="Search by name, email, username, or group"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {feedback ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700"
              }`}
            >
              {feedback.message}
            </div>
          ) : null}

          {me ? (
            <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Signed in as <span className="font-medium">{me.username}</span>. Current groups:{" "}
              <span className="font-medium">
                {me.groups.length ? me.groups.map((group) => formatGroupLabel(group)).join(", ") : "None"}
              </span>
              .
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-12 animate-pulse rounded-2xl bg-slate-100" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No users found"
              description="Try a different search or verify that Cognito users exist in this environment."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Groups</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((record) => {
                  const currentUserRow = isCurrentUserRow(record);

                  return (
                    <TableRow key={record.username}>
                      <TableCell>
                        <p className="font-medium text-slate-900">{record.name || "-"}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.enabled ? record.status : "Disabled"}
                        </p>
                      </TableCell>
                      <TableCell>{record.email || "-"}</TableCell>
                      <TableCell>{record.username}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          {record.groups.length ? (
                            record.groups.map((group) => (
                              <span
                                key={`${record.username}-${group}`}
                                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                              >
                                {formatGroupLabel(group)}
                              </span>
                            ))
                          ) : (
                            <span className="text-muted-foreground">No groups assigned</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          disabled={currentUserRow}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => openEditor(record)}
                        >
                          {currentUserRow ? "Cannot edit self" : "Manage Groups"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        description="Select one or more groups for this user. Changes are applied in Cognito immediately."
        onClose={() => setOpen(false)}
        open={open}
        title={editing ? `Manage Access for ${editing.username}` : "Manage Access"}
      >
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <p className="font-medium text-slate-900">{editing?.name || editing?.username}</p>
            <p>{editing?.email || "No email available"}</p>
          </div>

          <div className="grid gap-3">
            {groups.map((group) => (
              <label
                className="flex items-start gap-3 rounded-2xl border border-border px-4 py-3 text-sm text-slate-700"
                key={group.name}
              >
                <Checkbox
                  checked={selectedGroups.includes(group.name)}
                  onChange={(event) => toggleGroup(group.name, event.target.checked)}
                />
                <span>
                  <span className="block font-medium text-slate-900">{formatGroupLabel(group.name)}</span>
                  <span className="block text-muted-foreground">
                    {group.description || groupDescriptionMap[group.name]}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={saving} type="button" onClick={() => void saveGroups()}>
              {saving ? "Saving..." : "Save Groups"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};

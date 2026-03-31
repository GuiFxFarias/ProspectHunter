"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Profile = {
  id: string;
  nome: string | null;
  role: "admin" | "user";
};

export default function UsersAdminPage() {
  const router = useRouter();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newNome, setNewNome] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth/login");
        return;
      }

      const { data: myProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!myProfile || myProfile.role !== "admin") {
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      setIsAdmin(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, role")
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setProfiles((data as Profile[]) ?? []);
      }
      setLoading(false);
    };

    init();
  }, [router]);

  const updateProfile = async (id: string, patch: Partial<Profile>) => {
    const prev = profiles;
    setProfiles((current) =>
      current.map((p) => (p.id === id ? { ...p, ...patch } : p))
    );

    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id);

    if (error) {
      setError(error.message);
      setProfiles(prev);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: session?.access_token
            ? `Bearer ${session.access_token}`
            : "",
        },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          nome: newNome,
          role: newRole,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erro ao criar usuário");
      }

      setNewEmail("");
      setNewPassword("");
      setNewNome("");

      const { data, error } = await supabase
        .from("profiles")
        .select("id, nome, role")
        .order("created_at", { ascending: true });

      if (!error) {
        setProfiles((data as Profile[]) ?? []);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <p className="p-4 text-sm text-zinc-600">Carregando usuários...</p>;
  }

  if (!isAdmin) {
    return (
      <p className="p-4 text-sm text-zinc-600">
        Você não tem permissão para acessar esta página.
      </p>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <main className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-lg font-semibold text-zinc-900">
          Administração de usuários
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Gerencie o nome e o papel (admin / user) de cada conta.
        </p>

        {error && (
          <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleCreateUser}
          className="mt-4 grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-xs md:grid-cols-4"
        >
          <div className="space-y-1 md:col-span-2">
            <label className="text-[11px] font-medium text-zinc-700">
              E-mail
            </label>
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-700">
              Senha
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-700">
              Nome
            </label>
            <input
              type="text"
              value={newNome}
              onChange={(e) => setNewNome(e.target.value)}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-700">
              Papel
            </label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
              className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex items-end justify-end md:col-span-4">
            <button
              type="submit"
              disabled={creating}
              className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
            >
              {creating ? "Criando..." : "Criar usuário"}
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2">ID</th>
                <th className="px-3 py-2">Papel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 text-[11px] text-zinc-800">
              {profiles.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                    Nome do usuário:
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={p.nome ?? ""}
                      onChange={(e) =>
                        updateProfile(p.id, { nome: e.target.value })
                      }
                      className="w-full rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={p.role}
                      onChange={(e) =>
                        updateProfile(p.id, {
                          role: e.target.value as "admin" | "user",
                        })
                      }
                      className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}


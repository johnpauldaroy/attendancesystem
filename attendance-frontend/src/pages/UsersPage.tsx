import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pencil, UserPlus, ArrowLeft, Trash2, KeyRound, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';

const UsersPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<any>(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'STAFF',
        branch_id: '',
        status: 'ACTIVE'
    });
    const [passwordModalUser, setPasswordModalUser] = useState<any>(null);
    const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });
    const [isImporting, setIsImporting] = useState(false);
    const [importErrors, setImportErrors] = useState<string[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (user && user.role !== 'SUPER_ADMIN') {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
                <p>Only Super Admins can manage users.</p>
                <Button className="mt-4" onClick={() => navigate('/')}>Go Back</Button>
            </div>
        );
    }

    const { data: users, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const res = await api.get('/users');
            return res.data;
        },
        enabled: !!user
    });

    const { data: branches } = useQuery({
        queryKey: ['branches'],
        queryFn: async () => {
            const res = await api.get('/branches');
            return res.data;
        },
        enabled: !!user
    });

    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            if (editingUser) {
                await api.put(`/users/${editingUser.id}`, data);
            } else {
                await api.post('/users', data);
            }
        },
        onSuccess: () => {
            toast.success(editingUser ? 'User updated' : 'User created');
            setIsModalOpen(false);
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to save user');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/users/${id}`);
        },
        onSuccess: () => {
            toast.success('User deleted');
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Delete failed');
        }
    });

    const passwordMutation = useMutation({
        mutationFn: async ({ id, password }: any) => {
            await api.put(`/users/${id}`, { ...editingUser, password });
        },
        onSuccess: () => {
            toast.success('Password updated');
            setPasswordModalUser(null);
            setPasswordForm({ password: '', confirm: '' });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Password update failed');
        }
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveMutation.mutate(formData);
    };

    const handleEdit = (u: any) => {
        setEditingUser(u);
        setFormData({
            name: u.name,
            email: u.email,
            password: '',
            role: u.role,
            branch_id: u.branch_id || '',
            status: u.status || 'ACTIVE'
        });
        setIsModalOpen(true);
    };

    const submitSetPassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordForm.password !== passwordForm.confirm) return toast.error('Passwords do not match');
        passwordMutation.mutate({ id: passwordModalUser.id, password: passwordForm.password });
    };

    const handleTemplate = () => {
        const link = document.createElement('a');
        link.href = '/user_template.csv';
        link.setAttribute('download', 'user_template.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        setImportErrors([]);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                if (!rows.length) {
                    toast.error('No data found in CSV');
                    setIsImporting(false);
                    return;
                }
                try {
                    const res = await api.post('/users/import', { users: rows });
                    const success = res.data.success_count ?? rows.length;
                    const errors = res.data.errors ?? [];
                    if (errors.length) {
                        setImportErrors(errors);
                        toast.warning(`Imported ${success}, ${errors.length} failed`);
                    } else {
                        toast.success(`Imported ${success} user(s)`);
                    }
                    queryClient.invalidateQueries({ queryKey: ['users'] });
                } catch (err: any) {
                    console.error(err);
                    toast.error(err.response?.data?.message || 'Import failed');
                } finally {
                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            },
            error: (err) => {
                console.error(err);
                toast.error('Failed to parse CSV');
                setIsImporting(false);
            }
        });
    };

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 lg:p-8">
            <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
                    <div className="flex items-center gap-4 flex-1">
                        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold tracking-tight">User Management</h1>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                        <Button variant="outline" size="sm" className="w-full sm:w-auto h-10" onClick={handleTemplate}>Template CSV</Button>
                        <Button variant="outline" size="sm" className="w-full sm:w-auto h-10" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                            {isImporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Import CSV
                        </Button>
                        <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
                        <Button onClick={() => { setEditingUser(null); setFormData({ name: '', email: '', password: '', role: 'STAFF', branch_id: '', status: 'ACTIVE' }); setIsModalOpen(true); }} className="w-full sm:w-auto h-10">
                            <UserPlus className="mr-2 h-4 w-4" /> Add User
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader><CardTitle>System Users</CardTitle></CardHeader>
                    <CardContent>
                        {importErrors.length > 0 && (
                            <div className="mb-4 p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800 max-h-40 overflow-y-auto">
                                <div className="font-semibold mb-1">Import warnings ({importErrors.length}):</div>
                                <ul className="list-disc pl-4 space-y-1">
                                    {importErrors.slice(0, 50).map((err, idx) => (
                                        <li key={idx}>{err}</li>
                                    ))}
                                    {importErrors.length > 50 && <li>...and more</li>}
                                </ul>
                            </div>
                        )}
                        <div className="overflow-x-auto">
                        <Table className="min-w-[720px]">
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Branch</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="animate-spin h-8 w-8 mx-auto" /></TableCell></TableRow>
                                ) : users?.map((u: any) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell><Badge variant={u.role === 'SUPER_ADMIN' ? 'destructive' : 'secondary'}>{u.role}</Badge></TableCell>
                                        <TableCell>{u.branch?.name || u.branch_id || '-'}</TableCell>
                                        <TableCell><Badge variant={u.status === 'ACTIVE' ? 'default' : 'secondary'}>{u.status}</Badge></TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}><Pencil className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" onClick={() => setPasswordModalUser(u)}><KeyRound className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => { if (confirm('Are you sure?')) deleteMutation.mutate(u.id) }} disabled={u.id === user?.id}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {isModalOpen && (
                <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle></DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div><label className="text-sm font-medium">Full Name</label><Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} /></div>
                            <div><label className="text-sm font-medium">Email</label><Input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!!editingUser} /></div>
                            {!editingUser && (<div><label className="text-sm font-medium">Password</label><Input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} /></div>)}
                            <div>
                                <label className="text-sm font-medium">Role</label>
                                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                                    <option value="STAFF">STAFF</option>
                                    <option value="BRANCH_ADMIN">BRANCH_ADMIN</option>
                                    <option value="APPROVER">APPROVER</option>
                                    <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Branch</label>
                                <select
                                    required
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3"
                                    value={formData.branch_id}
                                    onChange={e => setFormData({ ...formData, branch_id: e.target.value })}
                                >
                                    <option value="">Select branch</option>
                                    {(branches || []).map((b: any) => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium">Status</label>
                                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                    <option value="ACTIVE">ACTIVE</option>
                                    <option value="INACTIVE">INACTIVE</option>
                                </select>
                            </div>
                            <div className="flex flex-col sm:flex-row justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setIsModalOpen(false)} className="w-full sm:w-auto">Cancel</Button><Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">Save User</Button></div>
                        </form>
                    </DialogContent>
                </Dialog>
            )}

            {passwordModalUser && (
                <Dialog open={!!passwordModalUser} onOpenChange={() => setPasswordModalUser(null)}>
                    <DialogContent className="max-w-md">
                        <DialogHeader><DialogTitle>Set Password</DialogTitle></DialogHeader>
                        <form className="space-y-4" onSubmit={submitSetPassword}>
                            <div><label className="text-sm font-medium">New Password</label><Input type="password" required minLength={6} value={passwordForm.password} onChange={e => setPasswordForm({ ...passwordForm, password: e.target.value })} /></div>
                            <div><label className="text-sm font-medium">Confirm Password</label><Input type="password" required minLength={6} value={passwordForm.confirm} onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })} /></div>
                            <div className="flex flex-col sm:flex-row justify-end gap-2"><Button variant="ghost" type="button" onClick={() => setPasswordModalUser(null)} className="w-full sm:w-auto">Cancel</Button><Button type="submit" disabled={passwordMutation.isPending} className="w-full sm:w-auto">Update Password</Button></div>
                        </form>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
};

export default UsersPage;

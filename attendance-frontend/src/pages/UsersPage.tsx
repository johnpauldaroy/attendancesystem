import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db, functions } from '@/lib/firebase';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { initializeApp, getApp } from 'firebase/app';
import { getAuth, signOut as secondarySignOut, createUserWithEmailAndPassword as secondaryCreateUser } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Pencil, UserPlus, ArrowLeft, Trash2, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Helper to create user without logging out current admin
// We initialize a secondary app instance
const createSecondaryUser = async (email: string, password: string) => {
    let secondaryApp;
    try {
        const config = getApp().options; // Use same config
        secondaryApp = initializeApp(config, "SecondaryApp");
    } catch (e) {
        secondaryApp = getApp("SecondaryApp");
    }
    const secondaryAuth = getAuth(secondaryApp);
    const userCredential = await secondaryCreateUser(secondaryAuth, email, password);
    await secondarySignOut(secondaryAuth);
    return userCredential.user;
};

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
        branch_name: '',
        status: 'ACTIVE'
    });
    const [passwordModalUser, setPasswordModalUser] = useState<any>(null);
    const [passwordForm, setPasswordForm] = useState({ password: '', confirm: '' });

    // Check Access
    if (user && user.role !== 'SUPER_ADMIN') {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold text-destructive">Access Denied</h1>
                <p>Only Super Admins can manage users.</p>
                <Button className="mt-4" onClick={() => navigate('/')}>Go Back</Button>
            </div>
        );
    }

    // Fetch Users
    const { data: users, isLoading } = useQuery({
        queryKey: ['users'],
        queryFn: async () => {
            const snapshot = await getDocs(collection(db, 'users'));
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
    });

    // Mutations
    const saveMutation = useMutation({
        mutationFn: async (data: any) => {
            if (editingUser) {
                // Update existing
                const { password, ...updateData } = data; // Don't update password directly in Firestore/Auth here easily
                await updateDoc(doc(db, 'users', editingUser.id), {
                    name: updateData.name,
                    role: updateData.role,
                    branch_id: updateData.branch_id,
                    branch: { id: updateData.branch_id, name: updateData.branch_name || `Branch ${updateData.branch_id}` },
                    status: updateData.status
                });
            } else {
                // Create New
                try {
                    // 1. Create Auth User (Secondary App)
                    const newUser = await createSecondaryUser(data.email, data.password);

                    // 2. Create Firestore Profile
                    await setDoc(doc(db, 'users', newUser.uid), {
                        name: data.name,
                        email: data.email,
                        role: data.role,
                        branch_id: data.branch_id,
                        branch: { id: data.branch_id, name: data.branch_name || `Branch ${data.branch_id}` },
                        status: data.status
                    });
                } catch (e: any) {
                    console.error(e);
                    throw new Error(e.message);
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            setIsModalOpen(false);
            toast.success(editingUser ? 'User updated' : 'User created successfully');
        },
        onError: (err) => toast.error('Error: ' + err.message)
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
            password: '', // Leave blank
            role: u.role,
            branch_id: u.branch_id || '',
            branch_name: u.branch?.name || '',
            status: u.status || 'ACTIVE'
        });
        setIsModalOpen(true);
    };

    const deleteMutation = useMutation({
        mutationFn: async (userId: string) => {
            // Removes Firestore profile. Auth user removal still requires Admin SDK.
            await deleteDoc(doc(db, 'users', userId));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['users'] });
            toast.success('User deleted');
        },
        onError: (err) => toast.error('Delete failed: ' + err.message)
    });

    const handleDelete = (u: any) => {
        if (!user || user.role !== 'SUPER_ADMIN') return;
        if (u.id === user.uid) {
            toast.error("You can't delete your own account while logged in.");
            return;
        }
        const confirmed = window.confirm(`Delete user "${u.name}"? This removes their profile; their Firebase Auth login stays until removed via Admin SDK.`);
        if (confirmed) {
            deleteMutation.mutate(u.id);
        }
    };

    const setPasswordMutation = useMutation({
        mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
            const callable = httpsCallable(functions, 'adminSetUserPassword');
            await callable({ uid: userId, password });
        },
        onSuccess: () => {
            toast.success('Password updated');
            setPasswordModalUser(null);
            setPasswordForm({ password: '', confirm: '' });
        },
        onError: (err: any) => {
            const code = err?.code ? ` (${err.code})` : '';
            const details = err?.message || 'unknown error';
            toast.error('Password update failed' + code + ': ' + details);
        }
    });

    const openSetPassword = (u: any) => {
        if (!user || user.role !== 'SUPER_ADMIN') return;
        setPasswordModalUser(u);
        setPasswordForm({ password: '', confirm: '' });
    };

    const submitSetPassword = (e: React.FormEvent) => {
        e.preventDefault();
        if (!passwordModalUser) return;
        if (passwordForm.password.length < 6) {
            toast.error('Password must be at least 6 characters.');
            return;
        }
        if (passwordForm.password !== passwordForm.confirm) {
            toast.error('Passwords do not match.');
            return;
        }
        setPasswordMutation.mutate({ userId: passwordModalUser.id, password: passwordForm.password });
    };

    const handleAdd = () => {
        setEditingUser(null);
        setFormData({
            name: '',
            email: '',
            password: '',
            role: 'STAFF',
            branch_id: '',
            branch_name: '',
            status: 'ACTIVE'
        });
        setIsModalOpen(true);
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
                    <Button onClick={handleAdd} className="w-full sm:w-auto h-10">
                        <UserPlus className="mr-2 h-4 w-4" /> Add User
                    </Button>
                </div>

                {/* Desktop Table View */}
                <Card className="hidden md:block">
                    <CardHeader>
                        <CardTitle>System Users</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Branch ID</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={6}>Loading...</TableCell></TableRow>
                                ) : users?.map((u: any) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell>{u.email}</TableCell>
                                        <TableCell>
                                            <Badge variant={u.role === 'SUPER_ADMIN' ? 'destructive' : 'secondary'} className="text-xs">
                                                {u.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{u.branch_id || '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-xs">
                                                {u.status || 'ACTIVE'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(u)}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => openSetPassword(u)}
                                                title="Set password"
                                            >
                                                <KeyRound className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDelete(u)}
                                                disabled={deleteMutation.isPending}
                                            >
                                                <Trash2 className="h-4 w-4 text-destructive" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {isLoading ? (
                        <Card>
                            <CardContent className="text-center py-12">Loading...</CardContent>
                        </Card>
                    ) : users?.map((u: any) => (
                        <Card key={u.id}>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{u.name}</CardTitle>
                                        <p className="text-xs text-muted-foreground mt-1">{u.email}</p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(u)} className="h-9 w-9">
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => openSetPassword(u)} className="h-9 w-9" title="Set password">
                                            <KeyRound className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDelete(u)} className="h-9 w-9" disabled={deleteMutation.isPending}>
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-2 pt-0">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Role:</span>
                                    <Badge variant={u.role === 'SUPER_ADMIN' ? 'destructive' : 'secondary'} className="text-xs">
                                        {u.role}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Branch ID:</span>
                                    <span className="font-medium">{u.branch_id || '-'}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Status:</span>
                                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'} className="text-xs">
                                        {u.status || 'ACTIVE'}
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {isModalOpen && (
                    <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle className="text-lg md:text-xl">{editingUser ? 'Edit User' : 'Add New User'}</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="text-sm font-medium">Full Name</label>
                                    <Input required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="h-10 mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Email</label>
                                    <Input required type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} disabled={!!editingUser} className="h-10 mt-1" />
                                </div>
                                {!editingUser && (
                                    <div>
                                        <label className="text-sm font-medium">Password</label>
                                        <Input required type="password" value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className="h-10 mt-1" />
                                    </div>
                                )}
                                <div>
                                    <label className="text-sm font-medium">Role</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 mt-1"
                                        value={formData.role}
                                        onChange={e => setFormData({ ...formData, role: e.target.value })}
                                    >
                                        <option value="STAFF">STAFF</option>
                                        <option value="BRANCH_ADMIN">BRANCH_ADMIN</option>
                                        <option value="APPROVER">APPROVER</option>
                                        <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Branch ID</label>
                                    <Input value={formData.branch_id} onChange={e => setFormData({ ...formData, branch_id: e.target.value })} placeholder="e.g. 1" className="h-10 mt-1" />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Status</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 mt-1"
                                        value={formData.status}
                                        onChange={e => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="ACTIVE">ACTIVE</option>
                                        <option value="INACTIVE">INACTIVE</option>
                                    </select>
                                </div>
                                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4">
                                    <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="w-full sm:w-auto">Cancel</Button>
                                    <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
                                        {saveMutation.isPending ? 'Saving...' : 'Save User'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}

                {passwordModalUser && (
                    <Dialog open={!!passwordModalUser} onOpenChange={() => setPasswordModalUser(null)}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle className="text-lg md:text-xl">Set Password</DialogTitle>
                            </DialogHeader>
                            <form className="space-y-4" onSubmit={submitSetPassword}>
                                <div className="text-sm text-muted-foreground">
                                    Set a new password for <span className="font-semibold text-foreground">{passwordModalUser.name}</span> ({passwordModalUser.email})
                                </div>
                                <div>
                                    <label className="text-sm font-medium">New Password</label>
                                    <Input
                                        type="password"
                                        value={passwordForm.password}
                                        onChange={e => setPasswordForm({ ...passwordForm, password: e.target.value })}
                                        className="h-10 mt-1"
                                        required
                                        minLength={6}
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium">Confirm Password</label>
                                    <Input
                                        type="password"
                                        value={passwordForm.confirm}
                                        onChange={e => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                        className="h-10 mt-1"
                                        required
                                        minLength={6}
                                    />
                                </div>
                                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                                    <Button type="button" variant="ghost" onClick={() => setPasswordModalUser(null)} className="w-full sm:w-auto">Cancel</Button>
                                    <Button type="submit" disabled={setPasswordMutation.isPending} className="w-full sm:w-auto">
                                        {setPasswordMutation.isPending ? 'Saving...' : 'Update Password'}
                                    </Button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>
        </div>
    );
};

export default UsersPage;

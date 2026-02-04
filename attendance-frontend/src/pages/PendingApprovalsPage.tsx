import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, X, ArrowLeft, Loader2, Calendar, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const PendingApprovalsPage = () => {
    const queryClient = useQueryClient();
    const [rejectId, setRejectId] = useState<string | null>(null);
    const [reason, setReason] = useState('');
    const { user } = useAuth();

    const { data: pendings, isLoading } = useQuery({
        queryKey: ['pending-approvals', user?.uid],
        queryFn: async () => {
            if (!user) return { data: [] };

            // Build query conditionally based on user role
            let q;
            if (user.role === 'SUPER_ADMIN') {
                // Super admin sees all branches
                q = query(
                    collection(db, 'attendance'),
                    where('status', '==', 'PENDING')
                );
            } else {
                // Other roles see only their branch
                q = query(
                    collection(db, 'attendance'),
                    where('status', '==', 'PENDING'),
                    where('origin_branch_id', '==', String(user.branch_id))
                );
            }

            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            return {
                data: data.sort((a, b) => b.attendance_date_time?.seconds - a.attendance_date_time?.seconds)
            };
        },
        enabled: !!user
    });

    const approveMutation = useMutation({
        mutationFn: async (id: string) => {
            await updateDoc(doc(db, 'attendance', id), {
                status: 'APPROVED',
                approved_by_user_id: user?.id || user?.uid,
                approved_at: Timestamp.now()
            });
        },
        onSuccess: async (_, id) => {
            toast.success('Attendance approved');
            try {
                await addDoc(collection(db, 'audit_logs'), {
                    action_type: 'APPROVE_ATTENDANCE',
                    entity_type: 'Attendance',
                    entity_id: id,
                    actor_user_id: user?.uid || 'unknown',
                    actor_name: user?.email || 'unknown',
                    created_at: Timestamp.now()
                });
            } catch (e) { console.error(e); }

            queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
            await updateDoc(doc(db, 'attendance', id), {
                status: 'REJECTED',
                rejection_reason: reason,
                approved_by_user_id: user?.id || user?.uid,
                approved_at: Timestamp.now()
            });
        },
        onSuccess: async (_, { id, reason }) => {
            toast.success('Attendance rejected');
            try {
                await addDoc(collection(db, 'audit_logs'), {
                    action_type: 'REJECT_ATTENDANCE',
                    entity_type: 'Attendance',
                    entity_id: id,
                    actor_user_id: user?.uid || 'unknown',
                    actor_name: user?.email || 'unknown',
                    after: { reason },
                    created_at: Timestamp.now()
                });
            } catch (e) { console.error(e); }

            setRejectId(null);
            setReason('');
            queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
        }
    });

    if (isLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-5xl space-y-4">
                <div className="flex items-center gap-4">
                    <Link to="/">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                    </Link>
                    <h1 className="text-xl md:text-2xl font-bold">Pending Approvals</h1>
                </div>

                {/* Desktop Table View */}
                <Card className="hidden md:block">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date/Time</TableHead>
                                    <TableHead>Member</TableHead>
                                    <TableHead>Origin Branch</TableHead>
                                    <TableHead>Visited Branch</TableHead>
                                    <TableHead>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendings?.data && pendings.data.length > 0 ? (
                                    pendings.data.map((row: any) => (
                                        <TableRow key={row.id}>
                                            <TableCell>
                                                {row.attendance_date_time?.toDate ? row.attendance_date_time.toDate().toLocaleString() : new Date(row.attendance_date_time).toLocaleString()}
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{row.member?.full_name}</div>
                                                <div className="text-xs text-muted-foreground">{row.member?.member_no}</div>
                                            </TableCell>
                                            <TableCell>{row.origin_branch?.name}</TableCell>
                                            <TableCell>{row.visited_branch?.name}</TableCell>
                                            <TableCell>
                                                <div className="flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        variant="success"
                                                        className="bg-green-600 hover:bg-green-700 h-8 text-white"
                                                        onClick={() => approveMutation.mutate(row.id)}
                                                        disabled={approveMutation.isPending}
                                                    >
                                                        <Check className="h-4 w-4 mr-1" /> Approve
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        className="h-8"
                                                        onClick={() => setRejectId(row.id)}
                                                    >
                                                        <X className="h-4 w-4 mr-1" /> Reject
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
                                            No pending records found
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {pendings?.data && pendings.data.length > 0 ? (
                        pendings.data.map((row: any) => (
                            <Card key={row.id}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-base">{row.member?.full_name}</CardTitle>
                                            <p className="text-xs text-muted-foreground mt-1">{row.member?.member_no}</p>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pb-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs">
                                            {row.attendance_date_time?.toDate ? row.attendance_date_time.toDate().toLocaleString() : new Date(row.attendance_date_time).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <div className="text-muted-foreground mb-1">Origin</div>
                                            <div className="font-medium flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {row.origin_branch?.name}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1">Visited</div>
                                            <div className="font-medium flex items-center gap-1">
                                                <MapPin className="h-3 w-3" />
                                                {row.visited_branch?.name}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex gap-2 pt-3">
                                    <Button
                                        size="sm"
                                        className="flex-1 bg-green-600 hover:bg-green-700 text-white h-11"
                                        onClick={() => approveMutation.mutate(row.id)}
                                        disabled={approveMutation.isPending}
                                    >
                                        <Check className="h-4 w-4 mr-2" /> Approve
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        className="flex-1 h-11"
                                        onClick={() => setRejectId(row.id)}
                                    >
                                        <X className="h-4 w-4 mr-2" /> Reject
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))
                    ) : (
                        <Card>
                            <CardContent className="text-center py-12 text-muted-foreground">
                                No pending records found
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Rejection Dialog */}
                {rejectId && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                        <Card className="w-full max-w-md shadow-2xl">
                            <CardHeader>
                                <CardTitle className="text-lg md:text-xl">Reject Attendance</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Rejection Reason</label>
                                    <Input
                                        placeholder="e.g., Member not recognized, Incorrect branch..."
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        className="h-11"
                                    />
                                </div>
                            </CardContent>
                            <CardFooter className="flex flex-col sm:flex-row justify-end gap-2">
                                <Button variant="ghost" onClick={() => setRejectId(null)} className="w-full sm:w-auto">
                                    Cancel
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => rejectMutation.mutate({ id: rejectId, reason })}
                                    disabled={!reason || rejectMutation.isPending}
                                    className="w-full sm:w-auto"
                                >
                                    Confirm Rejection
                                </Button>
                            </CardFooter>
                        </Card>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PendingApprovalsPage;

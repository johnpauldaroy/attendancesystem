import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Check, X, ArrowLeft, Loader2, Calendar, MapPin, ChevronLeft, ChevronRight, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const PendingApprovalsPage = () => {
    const queryClient = useQueryClient();
    const [rejectId, setRejectId] = useState<number | string | null>(null);
    const [reason, setReason] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const { user } = useAuth();

    const { data: response, isLoading } = useQuery({
        queryKey: ['pending-approvals', currentPage],
        queryFn: async () => {
            const res = await api.get('/attendance/pending-approvals', {
                params: { page: currentPage }
            });
            return res.data;
        },
        enabled: !!user
    });

    const pendings = response?.data || [];
    const totalPages = response?.last_page || 1;

    const approveMutation = useMutation({
        mutationFn: async (id: number | string) => {
            await api.post(`/attendance/${id}/approve`);
        },
        onSuccess: () => {
            toast.success('Attendance approved');
            queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to approve');
        }
    });

    const rejectMutation = useMutation({
        mutationFn: async ({ id, reason }: { id: number | string; reason: string }) => {
            await api.post(`/attendance/${id}/reject`, { rejection_reason: reason });
        },
        onSuccess: () => {
            toast.success('Attendance rejected');
            setRejectId(null);
            setReason('');
            queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to reject');
        }
    });

    if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-5xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3 sm:gap-4">
                        <Link to="/">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <h1 className="text-xl md:text-2xl font-bold font-heading">Pending Approvals</h1>
                    </div>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-2 bg-background/50 p-1 rounded-md border shadow-sm self-start sm:self-auto">
                            <span className="text-xs font-medium px-2 whitespace-nowrap">Page {currentPage} of {totalPages}</span>
                            <div className="flex gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Desktop Table View */}
                <Card className="hidden md:block border-none shadow-md">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-[860px]">
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead className="font-bold">Date/Time</TableHead>
                                        <TableHead className="font-bold">Member</TableHead>
                                        <TableHead className="font-bold">Origin Branch</TableHead>
                                        <TableHead className="font-bold">Visited Branch</TableHead>
                                        <TableHead className="font-bold">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendings.length > 0 ? (
                                        pendings.map((row: any) => (
                                            <TableRow key={row.id}>
                                                <TableCell className="text-xs">
                                                    {new Date(row.attendance_date_time).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-sm">{row.member?.full_name}</div>
                                                    <div className="text-[10px] text-muted-foreground">{row.member?.member_no}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">{row.origin_branch?.name || row.origin_branch_id}</TableCell>
                                                <TableCell className="text-xs">{row.visited_branch?.name || row.visited_branch_id}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button
                                                            size="sm"
                                                            className="bg-[#2c2a9c] hover:bg-[#241f7a] h-8 text-white px-3"
                                                            onClick={() => approveMutation.mutate(row.id)}
                                                            disabled={approveMutation.isPending}
                                                        >
                                                            <Check className="h-4 w-4 mr-1" /> Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
                                            <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle className="h-8 w-8 opacity-20" />
                                                    <p>All caught up! No pending records found.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {pendings.length > 0 ? (
                        pendings.map((row: any) => (
                            <Card key={row.id}>
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <CardTitle className="text-base break-words">{row.member?.full_name}</CardTitle>
                                            <p className="text-xs text-muted-foreground mt-1">{row.member?.member_no}</p>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3 pb-3">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs">
                                            {new Date(row.attendance_date_time).toLocaleString()}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 text-xs">
                                        <div>
                                            <div className="text-muted-foreground mb-1">Origin</div>
                                            <div className="font-medium flex items-center gap-1 break-words">
                                                <MapPin className="h-3 w-3" />
                                                {row.origin_branch?.name || row.origin_branch_id}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-muted-foreground mb-1">Visited</div>
                                            <div className="font-medium flex items-center gap-1 break-words">
                                                <MapPin className="h-3 w-3" />
                                                {row.visited_branch?.name || row.visited_branch_id}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex flex-col min-[420px]:flex-row gap-2 pt-3">
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
                                        placeholder="e.g., Member not recognized..."
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

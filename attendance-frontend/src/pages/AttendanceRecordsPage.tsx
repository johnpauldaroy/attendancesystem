import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Download, Trash2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

const AttendanceRecordsPage = () => {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [status, setStatus] = useState('');
    const [memberQuery, setMemberQuery] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [currentPage, setCurrentPage] = useState(1);

    const { data: response, isLoading } = useQuery({
        queryKey: ['attendance-records', status, memberQuery, dateFrom, dateTo, currentPage],
        queryFn: async () => {
            const res = await api.get('/attendance', {
                params: {
                    status,
                    member_query: memberQuery,
                    date_from: dateFrom,
                    date_to: dateTo,
                    page: currentPage,
                    per_page: 15
                }
            });
            return res.data;
        },
        enabled: !!user,
        staleTime: 15_000,
        gcTime: 300_000,
        refetchOnWindowFocus: false,
    });

    const records = response?.data || [];
    const totalPages = response?.last_page || 1;

    const clearHistoryMutation = useMutation({
        mutationFn: async () => {
            const res = await api.post('/attendance/clear-history', {
                status,
                member_query: memberQuery,
                date_from: dateFrom,
                date_to: dateTo,
            });
            return res.data;
        },
        onSuccess: (data: any) => {
            toast.success(data?.message || 'Attendance history cleared successfully');
            setCurrentPage(1);
            queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || 'Failed to clear history');
        }
    });

    const handleClearHistory = () => {
        const hasFilters = !!status || !!memberQuery || !!dateFrom || !!dateTo;
        const ok = confirm(
            hasFilters
                ? 'Clear attendance history that matches the current filters? This cannot be undone.'
                : 'Clear all attendance history records? This cannot be undone.'
        );
        if (!ok) return;
        clearHistoryMutation.mutate();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED': return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Approved</Badge>;
            case 'PENDING': return <Badge variant="secondary" className="bg-orange-500 hover:bg-orange-600 text-white">Pending</Badge>;
            case 'REJECTED': return <Badge variant="destructive">Rejected</Badge>;
            case 'CANCELLED': return <Badge variant="outline">Cancelled</Badge>;
            default: return <Badge variant="secondary">{status}</Badge>;
        }
    };

    const handleExport = async () => {
        // For export, we might want to fetch all or a larger chunk. 
        // For now, we'll just export what's on the screen + maybe a few more or just the current filters.
        toast.info('Export started...');
        try {
            const res = await api.get('/attendance', {
                params: { status, member_query: memberQuery, date_from: dateFrom, date_to: dateTo, per_page: 1000 }
            });
            const data = res.data.data;
            if (!data.length) return toast.error('No records to export');

            const headers = ["Date", "Member Name", "CIFKEY", "Origin", "Visited", "Logged By", "Status", "Remarks"];
            const escCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
            const csvRows = data.map((row: any) => [
                escCsv(new Date(row.attendance_date_time).toLocaleString()),
                escCsv(row.member?.full_name || ''),
                // Keep CIF key as text in Excel to preserve leading zeros and avoid scientific notation.
                escCsv(`="${row.member?.cif_key || ''}"`),
                escCsv(row.origin_branch?.name || ''),
                escCsv(row.visited_branch?.name || ''),
                escCsv(row.creator?.name || ''),
                escCsv(row.status),
                escCsv(row.status === 'REJECTED' ? (row.rejection_reason || row.notes || '') : '')
            ].join(","));

            const csvContent = "\ufeff" + headers.join(",") + "\n" + csvRows.join("\n");
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "attendance_records.csv");
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e) {
            toast.error('Export failed');
        }
    };

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-6xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <Link to="/">
                            <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
                        </Link>
                        <h1 className="text-xl md:text-2xl font-bold">Attendance Records</h1>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                        {user?.role === 'SUPER_ADMIN' && (
                            <Button
                                variant="destructive"
                                onClick={handleClearHistory}
                                className="w-full sm:w-auto h-10 bg-red-600 hover:bg-red-700"
                                disabled={clearHistoryMutation.isPending}
                            >
                                <Trash2 className="h-4 w-4 mr-2" />
                                {clearHistoryMutation.isPending ? 'Clearing...' : 'Clear History'}
                            </Button>
                        )}
                        <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto h-10">
                            <Download className="h-4 w-4 mr-2" /> Export CSV
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                            <div className="space-y-1">
                                <label className="text-xs font-medium uppercase text-muted-foreground">Status</label>
                                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setCurrentPage(1); }}>
                                    <option value="">All Status</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="PENDING">Pending</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CANCELLED">Cancelled</option>
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium uppercase text-muted-foreground">Member search</label>
                                <Input className="h-10" placeholder="Name or No..." value={memberQuery} onChange={(e) => { setMemberQuery(e.target.value); setCurrentPage(1); }} />
                            </div>
                            <div className="space-y-1 md:col-span-2">
                                <label className="text-xs font-medium uppercase text-muted-foreground">Date range</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    <Input type="date" className="h-10" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} />
                                    <Input type="date" className="h-10" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} />
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table className="min-w-[980px]">
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date/Time</TableHead>
                                        <TableHead>Member</TableHead>
                                        <TableHead>Origin Branch</TableHead>
                                        <TableHead>Visited Branch</TableHead>
                                        <TableHead>Logged By</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Remarks</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={7} className="text-center h-24"><Loader2 className="h-8 w-8 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : records.length > 0 ? (
                                        records.map((row: any) => (
                                            <TableRow key={row.id}>
                                                <TableCell className="text-xs">{new Date(row.attendance_date_time).toLocaleString()}</TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-sm">{row.member?.full_name}</div>
                                                    {row.member?.cif_key && (
                                                        <div className="text-[10px] text-muted-foreground">{row.member.cif_key}</div>
                                                    )}
                                                    <div className="text-[10px] text-muted-foreground">{row.member?.member_no}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">{row.origin_branch?.name || row.origin_branch_id}</TableCell>
                                                <TableCell className="text-xs">{row.visited_branch?.name || row.visited_branch_id}</TableCell>
                                                <TableCell className="text-xs">{row.creator?.name || row.created_by_name}</TableCell>
                                                <TableCell>{getStatusBadge(row.status)}</TableCell>
                                                <TableCell className="text-xs max-w-[260px] whitespace-normal break-words">
                                                    {row.status === 'REJECTED' ? (row.rejection_reason || row.notes || '-') : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={7} className="text-center h-24">No records found</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>

                        <div className="p-4 border-t flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div className="text-sm text-muted-foreground">Page {currentPage} of {totalPages}</div>
                            <div className="flex gap-2">
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight className="h-4 w-4" /></Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AttendanceRecordsPage;

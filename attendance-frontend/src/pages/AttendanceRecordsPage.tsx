import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { collection, query, getDocs } from 'firebase/firestore';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Download, Calendar, MapPin, User } from 'lucide-react';
import { Link } from 'react-router-dom';

const AttendanceRecordsPage = () => {
    const [status, setStatus] = useState('');
    const [memberNo, setMemberNo] = useState('');

    const { data: recordsData, isLoading } = useQuery({
        queryKey: ['attendance-records'],
        queryFn: async () => {
            const q = query(collection(db, 'attendance'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
            return data.sort((a, b) => (b.attendance_date_time?.seconds || 0) - (a.attendance_date_time?.seconds || 0));
        }
    });

    const filteredRecords = recordsData?.filter((record: any) => {
        const matchesStatus = status ? record.status === status : true;
        const matchesMember = memberNo ?
            (record.member?.member_no?.toLowerCase().includes(memberNo.toLowerCase()) ||
                record.member?.full_name?.toLowerCase().includes(memberNo.toLowerCase()))
            : true;
        return matchesStatus && matchesMember;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED': return <Badge variant="success" className="text-xs">Approved</Badge>;
            case 'PENDING': return <Badge variant="warning" className="text-xs">Pending</Badge>;
            case 'REJECTED': return <Badge variant="destructive" className="text-xs">Rejected</Badge>;
            default: return <Badge variant="secondary" className="text-xs">{status}</Badge>;
        }
    };

    const handleExport = () => {
        if (!filteredRecords || filteredRecords.length === 0) {
            alert('No records to export');
            return;
        }

        const headers = ["Date", "Member Name", "Member No", "Origin", "Visited", "Logged By", "Status"];
        const rows = filteredRecords.map((row: any) => {
            const date = row.attendance_date_time?.toDate ? row.attendance_date_time.toDate().toLocaleString() : new Date(row.attendance_date_time).toLocaleString();
            return [
                `"${date}"`,
                `"${row.member?.full_name || ''}"`,
                `"${row.member?.member_no || ''}"`,
                `"${row.origin_branch?.name || ''}"`,
                `"${row.visited_branch?.name || ''}"`,
                `"${row.created_by_name || ''}"`,
                `"${row.status}"`
            ];
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map((e: any[]) => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "attendance_records.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="min-h-screen bg-muted/30 p-3 md:p-4 space-y-4">
            <div className="container mx-auto max-w-6xl space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                        <Link to="/">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                        </Link>
                        <h1 className="text-xl md:text-2xl font-bold">Attendance Records</h1>
                    </div>
                    <Button variant="outline" onClick={handleExport} className="w-full sm:w-auto h-10">
                        <Download className="h-4 w-4 mr-2" /> Export CSV
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-medium uppercase text-muted-foreground">Status</label>
                                <select
                                    className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                >
                                    <option value="">All Status</option>
                                    <option value="APPROVED">Approved</option>
                                    <option value="PENDING">Pending</option>
                                    <option value="REJECTED">Rejected</option>
                                </select>
                            </div>
                            <div className="space-y-1 flex-1">
                                <label className="text-xs font-medium uppercase text-muted-foreground">Member search</label>
                                <Input
                                    className="h-10"
                                    placeholder="Name or No..."
                                    value={memberNo}
                                    onChange={(e) => setMemberNo(e.target.value)}
                                />
                            </div>
                        </div>
                    </CardHeader>

                    {/* Desktop Table View */}
                    <CardContent className="p-0 hidden md:block">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date/Time</TableHead>
                                        <TableHead>Member</TableHead>
                                        <TableHead>Origin Branch</TableHead>
                                        <TableHead>Visited Branch</TableHead>
                                        <TableHead>Logged By</TableHead>
                                        <TableHead>Status</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24">Loading records...</TableCell></TableRow>
                                    ) : filteredRecords && filteredRecords.length > 0 ? (
                                        filteredRecords.map((row: any) => (
                                            <TableRow key={row.id}>
                                                <TableCell className="text-xs whitespace-nowrap">
                                                    {row.attendance_date_time?.toDate ? row.attendance_date_time.toDate().toLocaleString() : new Date(row.attendance_date_time).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="font-medium text-sm">{row.member?.full_name}</div>
                                                    <div className="text-[10px] text-muted-foreground tracking-wider">{row.member?.member_no}</div>
                                                </TableCell>
                                                <TableCell className="text-xs">{row.origin_branch?.name}</TableCell>
                                                <TableCell className="text-xs">{row.visited_branch?.name}</TableCell>
                                                <TableCell className="text-xs">{row.created_by_name}</TableCell>
                                                <TableCell>{getStatusBadge(row.status)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow><TableCell colSpan={6} className="text-center h-24">No records found</TableCell></TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="p-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                            <div>Showing {filteredRecords?.length || 0} records</div>
                        </div>
                    </CardContent>

                    {/* Mobile Card View */}
                    <CardContent className="p-3 md:hidden space-y-3">
                        {isLoading ? (
                            <div className="text-center py-12 text-muted-foreground">Loading records...</div>
                        ) : filteredRecords && filteredRecords.length > 0 ? (
                            <>
                                {filteredRecords.map((row: any) => (
                                    <Card key={row.id} className="border">
                                        <CardContent className="p-3 space-y-3">
                                            <div className="flex items-start justify-between">
                                                <div className="flex-1">
                                                    <div className="font-semibold text-sm">{row.member?.full_name}</div>
                                                    <div className="text-xs text-muted-foreground">{row.member?.member_no}</div>
                                                </div>
                                                {getStatusBadge(row.status)}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <Calendar className="h-3 w-3" />
                                                <span>
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
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <User className="h-3 w-3" />
                                                Logged by: {row.created_by_name}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                                <div className="text-center text-sm text-muted-foreground pt-2">
                                    Showing {filteredRecords.length} records
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-12 text-muted-foreground">No records found</div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default AttendanceRecordsPage;

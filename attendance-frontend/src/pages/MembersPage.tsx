import { useAuth } from '@/hooks/useAuth';
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Save,
  Search,
  ArrowLeft,
  Upload,
  Loader2,
  FileSpreadsheet,
  FilePlus2,
  FileDown,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import Papa from 'papaparse';

const formatDateForInput = (dateStr: any) => {
  if (!dateStr) return '';
  const s = String(dateStr).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return s;
};

const initialFormState = {
  cif_key: '',
  status: 'ACTIVE',
  origin_branch_id: '',
  full_name: '',
  birth_date: '',
  age: '',
  sex: 'MALE',
  civil_status: 'SINGLE',
  spouse_name: '',
  address: '',
  unit_house_no: '',
  barangay_village: '',
  city_town: '',
  province: '',
  telephone_no: '',
  contact_no: '',
  date_of_membership: '',
  classification: '',
  membership_type: '',
  position: '',
  segmentation: '',
  attendance_status: '',
  representatives_status: '',
  annual_income: '',
  tin_no: '',
  sss_no: '',
  gsis_no: '',
  educational_attainment: '',
  membership_status: '',
  membership_update: '',
  attend_ra: '',
};

const MembersPage = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'list' | 'history'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [formData, setFormData] = useState(initialFormState);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingHistory, setIsExportingHistory] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number; success: number; errors: number } | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const handleEdit = (member: any) => {
    setEditingMember(member);
    setFormData({
      ...initialFormState,
      ...member,
      birth_date: formatDateForInput(member.birth_date),
      date_of_membership: formatDateForInput(member.date_of_membership),
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
    setFormData(initialFormState);
    if (searchParams.get('edit')) {
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      setSearchParams(next, { replace: true });
    }
  };

  const openEditById = async (id: string) => {
    try {
      const res = await api.get(`members/${id}`);
      const member = res.data?.data ?? res.data;
      if (!member) throw new Error('Member not found');
      handleEdit(member);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Unable to load member');
    }
  };

  const { data: branches } = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const res = await api.get('branches');
      return res.data;
    },
    enabled: !!user,
    staleTime: 300_000,
    gcTime: 900_000,
    refetchOnWindowFocus: false,
  });

  const { data: provinces } = useQuery({
    queryKey: ['provinces'],
    queryFn: async () => {
      const res = await api.get('locations/provinces');
      return res.data;
    },
    enabled: !!user,
    staleTime: 300_000,
    gcTime: 900_000,
    refetchOnWindowFocus: false,
  });

  const { data: cities } = useQuery({
    queryKey: ['cities', formData.province],
    queryFn: async () => {
      const res = await api.get('locations/cities', { params: { province: formData.province } });
      return res.data;
    },
    enabled: !!user && !!formData.province,
    staleTime: 300_000,
    gcTime: 900_000,
    refetchOnWindowFocus: false,
  });

  const { data: barangays } = useQuery({
    queryKey: ['barangays', formData.province, formData.city_town],
    queryFn: async () => {
      const res = await api.get('locations/barangays', { params: { province: formData.province, city: formData.city_town } });
      return res.data;
    },
    enabled: !!user && !!formData.province && !!formData.city_town,
    staleTime: 300_000,
    gcTime: 900_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [search]);

  // Open edit modal when ?edit=ID is present
  useEffect(() => {
    const editId = searchParams.get('edit');
    if (!editId) return;
    if (editingMember && String(editingMember.id) === editId) return;
    openEditById(editId);
  }, [searchParams, editingMember]);

  const { data: membersResponse, isLoading } = useQuery({
    queryKey: ['members', debouncedSearch, selectedBranch, currentPage],
    queryFn: async () => {
      const response = await api.get('members/search', {
        params: {
          q: debouncedSearch,
          branch_id: selectedBranch,
          page: currentPage,
          per_page: 10,
        },
      });
      return response.data;
    },
    enabled: !!user && activeTab === 'list',
    staleTime: 15_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const members = membersResponse?.data || [];
  const totalPages = membersResponse?.last_page || 1;
  const totalMembers = membersResponse?.total || 0;
  const showingFrom = membersResponse?.from || 0;
  const showingTo = membersResponse?.to || 0;

  const { data: auditResponse, isLoading: isHistoryLoading } = useQuery({
    queryKey: ['audit-logs', historyPage, selectedBranch],
    queryFn: async () => {
      const res = await api.get('audit-logs', { params: { action_type: 'MEMBER_UPDATE', per_page: 10, page: historyPage, branch_id: selectedBranch === 'all' ? undefined : selectedBranch } });
      return res.data;
    },
    enabled: !!user && activeTab === 'history',
    staleTime: 15_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const auditLogs = useMemo(() => {
    const data = auditResponse?.data || [];
    return data.filter((log: any) => log.action_type === 'MEMBER_UPDATE');
  }, [auditResponse]);

  const auditTotalPages = auditResponse?.last_page || 1;
  const auditFrom = auditResponse?.from || 0;
  const auditTo = auditResponse?.to || 0;
  const auditTotal = auditResponse?.total || 0;

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      if (editingMember) {
        await api.put(`members/${editingMember.id}`, data);
      } else {
        await api.post('members', data);
      }
    },
    onSuccess: () => {
      toast.success(editingMember ? 'Member updated' : 'Member created');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save member');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number | number[]) => {
      const payload = Array.isArray(ids) ? ids : [ids];
      if (payload.length === 1) {
        await api.delete(`members/${payload[0]}`);
      } else {
        await api.delete('members/bulk', { data: { ids: payload } });
      }
    },
    onSuccess: () => {
      toast.success('Member record(s) deleted');
      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Delete failed');
    },
  });

  const canDelete = user?.role !== 'STAFF';
  const canImport = user?.role !== 'STAFF';
  const canTemplate = user?.role !== 'STAFF';

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      let text = '';

      try {
        // Try UTF-8 first
        const decoder = new TextDecoder('utf-8', { fatal: true });
        text = decoder.decode(buffer);
      } catch (err) {
        // Fallback to ISO-8859-1 (common for Excel CSVs) if UTF-8 fails
        const decoder = new TextDecoder('iso-8859-1');
        text = decoder.decode(buffer);
      }

      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          const rawRows = results.data as any[];
          // Filter out completely empty rows or rows with no meaningful data
          const rows = rawRows.filter(row => {
            const values = Object.values(row);
            return values.some(v => v !== null && v !== undefined && String(v).trim().length > 0);
          });

          setImportErrors([]);
          if (!rows.length) {
            toast.error('No data found in CSV');
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          const batchSize = 50;
          let totalSuccess = 0;
          let totalErrors = 0;

          setImportProgress({ current: 0, total: rows.length, success: 0, errors: 0 });

          const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            try {
              const response = await api.post('members/import', { members: batch, skip_audit: true });

              totalSuccess += response.data.success_count || 0;
              totalErrors += response.data.error_count || 0;

              if (response.data.errors && response.data.errors.length > 0) {
                setImportErrors(prev => [...prev, ...response.data.errors]);
              }
            } catch (error: any) {
              console.error(`Batch starting at ${i} failed:`, error);
              const batchError = `Batch rows ${i + 1} to ${Math.min(i + batchSize, rows.length)} failed: ${error.message || 'Server Error'}`;
              setImportErrors(prev => [...prev, batchError]);
              totalErrors += batch.length;
            }

            setImportProgress({
              current: Math.min(i + batchSize, rows.length),
              total: rows.length,
              success: totalSuccess,
              errors: totalErrors
            });

            // Add a 1 second delay between batches to avoid rate limiting (429 errors)
            if (i + batchSize < rows.length) {
              await sleep(1000);
            }
          }

          toast.success(`Import completed! ${totalSuccess} successful, ${totalErrors} failed`);
          queryClient.invalidateQueries({ queryKey: ['members'] });
          setIsImporting(false);
          setImportProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        },
      });
    };
    reader.readAsArrayBuffer(file);
  };


  const handleToggleSelectAll = () => {
    if (members.length === 0) return;
    if (selectedIds.length === members.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(members.map((m: any) => m.id));
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    toast.info('Export started... This may take a moment.');
    try {
      const response = await api.get('members/export', {
        params: {
          q: debouncedSearch,
          branch_id: selectedBranch,
        },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `members_export_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Export completed successfully');
    } catch (e) {
      console.error('Export failed', e);
      toast.error('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleTemplate = () => {
    // Serve the ready-made CSV template from /public (system import expects CSV)
    const link = document.createElement('a');
    link.href = '/member_template.csv';
    link.setAttribute('download', 'member_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportHistory = async () => {
    setIsExportingHistory(true);
    try {
      const response = await api.get('audit-logs/export', {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `profile_update_history_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed', error);
      toast.error('Failed to export history');
    } finally {
      setIsExportingHistory(false);
    }
  };

  const formatDateTime = (value: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString();
  };

  const renderStatusBadge = (status?: string) => {
    const value = status || 'UNKNOWN';
    const map: Record<string, string> = {
      ACTIVE: 'bg-green-500 text-white',
      INCOMPLETE: 'bg-gray-200 text-gray-700',
      DEACTIVATED: 'bg-red-500 text-white',
      UNKNOWN: 'bg-gray-200 text-gray-700',
    };
    const cls = map[value] || 'bg-gray-200 text-gray-700';
    return <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${cls}`}>{value}</span>;
  };

  const renderActionBadge = (action?: string) => {
    if (!action) return '-';
    return (
      <span className="text-[11px] font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-700 border">
        {action}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-muted/30 pb-10">
      <div className="container mx-auto p-3 sm:p-4 space-y-4">
        <div className="flex items-start sm:items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">Members Management</h1>
            <p className="text-sm text-muted-foreground">Manage branch members and profiles</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="flex rounded-full border bg-white p-1 w-full sm:w-auto overflow-x-auto">
            <Button
              variant={activeTab === 'list' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-full whitespace-nowrap ${activeTab === 'list' ? 'bg-primary text-white px-4' : 'px-4'}`}
              onClick={() => {
                setActiveTab('list');
                setHistoryPage(1);
              }}
            >
              Members List
            </Button>
            <Button
              variant={activeTab === 'history' ? 'default' : 'ghost'}
              size="sm"
              className={`rounded-full whitespace-nowrap ${activeTab === 'history' ? 'bg-primary text-white px-4' : 'px-4'}`}
              onClick={() => {
                setActiveTab('history');
                setSelectedIds([]);
              }}
            >
              Profile Updates
            </Button>
          </div>

          {/* Import Progress Bar */}
          {importProgress && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 mb-4 w-full">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                <span className="text-sm font-medium text-blue-900 break-words">
                  Importing members... {importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()}
                </span>
                <span className="inline-flex w-fit text-sm text-blue-800 font-semibold bg-white/70 px-3 py-1 rounded-full">
                  {importProgress.total > 0
                    ? Math.round((importProgress.current / importProgress.total) * 100).toLocaleString()
                    : '0'}%
                </span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2.5 mb-2">
                <div
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                ></div>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-blue-800">
                <span>Success: {importProgress.success}</span>
                <span>Errors: {importProgress.errors}</span>
                {importErrors.length > 0 && (
                  <button
                    onClick={() => {
                      const blob = new Blob([importErrors.join('\n')], { type: 'text/plain' });
                      const url = URL.createObjectURL(blob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `import_errors_${new Date().getTime()}.txt`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                    }}
                    className="ml-auto text-blue-900 font-bold hover:underline"
                  >
                    Download Error Log
                  </button>
                )}
              </div>
            </div>
          )}

          {activeTab === 'list' && (
            <div className="flex flex-wrap gap-2 w-full xl:w-auto xl:ml-auto">
              <Button variant="outline" size="sm" onClick={handleTemplate} disabled={!canTemplate} className="w-full sm:w-auto">
                <FilePlus2 className="h-4 w-4 mr-2" /> Template
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isImporting || !canImport} className="w-full sm:w-auto">
                {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Import CSV
              </Button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImport} />
              <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting} className="w-full sm:w-auto">
                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                Export CSV
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="w-full sm:w-auto"
                disabled={!canDelete || selectedIds.length === 0 || deleteMutation.isPending}
                onClick={() => {
                  if (!canDelete || selectedIds.length === 0) return;
                  if (confirm(`Delete ${selectedIds.length} selected member(s)?`)) {
                    deleteMutation.mutate(selectedIds);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Selected
              </Button>
              <Button
                size="sm"
                className="bg-black hover:bg-gray-900 w-full sm:w-auto"
                onClick={() => {
                  setEditingMember(null);
                  setFormData(initialFormState);
                  setIsModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" /> Add Member
              </Button>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:ml-auto items-center">
              {user?.role === 'SUPER_ADMIN' && (
                <select
                  className="border rounded px-3 py-2 text-sm w-full sm:w-auto"
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setHistoryPage(1);
                  }}
                >
                  <option value="all">All Branches</option>
                  {(branches || []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={handleExportHistory} disabled={isExportingHistory}>
                {isExportingHistory ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileDown className="h-4 w-4 mr-2" />
                )}
                Export Log
              </Button>
            </div>
          )}
        </div>

        {activeTab === 'list' && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col md:flex-row gap-3 md:gap-4 justify-between items-stretch md:items-center">
                <div className="relative w-full md:w-2/3 lg:w-1/2">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, member no, or CIF key..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className="border rounded px-3 py-2 text-sm w-full md:w-48"
                  value={selectedBranch}
                  onChange={(e) => {
                    setSelectedBranch(e.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="all">All Branches</option>
                  {(branches || []).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[980px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={members.length > 0 && selectedIds.length === members.length}
                          onChange={handleToggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>CIF Key</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Origin Branch</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : members.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-10">
                          No members found
                        </TableCell>
                      </TableRow>
                    ) : (
                      members.map((m: any) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="h-4 w-4"
                              checked={selectedIds.includes(m.id)}
                              onChange={() =>
                                setSelectedIds((prev) =>
                                  prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id],
                                )
                              }
                            />
                          </TableCell>
                          <TableCell className="font-semibold">{m.cif_key}</TableCell>
                          <TableCell>{m.full_name}</TableCell>
                          <TableCell>{m.classification || '-'}</TableCell>
                          <TableCell>{m.contact_no || '-'}</TableCell>
                          <TableCell>{m.origin_branch?.name || m.origin_branch_id || '-'}</TableCell>
                          <TableCell>{renderStatusBadge(m.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(m)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => {
                                  if (!canDelete) return;
                                  if (confirm('Delete this member?')) deleteMutation.mutate(m.id);
                                }}
                                disabled={!canDelete}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-t bg-muted/50 text-sm text-muted-foreground gap-2">
                <div>
                  Showing {showingFrom || 0}-{showingTo || 0} of {totalMembers} members
                </div>
                <div className="flex w-full sm:w-auto justify-between sm:justify-start gap-2 mt-1 sm:mt-0">
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                    Previous
                  </Button>
                  <span className="self-center text-xs sm:text-sm">Page {currentPage} of {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'history' && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Profile Update History</CardTitle>
              <p className="text-sm text-muted-foreground">Log of all member profile changes</p>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="min-w-[920px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Member Name</TableHead>
                      <TableHead>Member ID</TableHead>
                      <TableHead>Updated By</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Changes (Remarks)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isHistoryLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : auditLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10">
                          No profile updates found
                        </TableCell>
                      </TableRow>
                    ) : (
                      auditLogs.map((log: any) => {
                        const after = log.after || {};
                        const before = log.before || {};
                        const memberId = after.cif_key || before.cif_key || after.member_no || before.member_no || log.entity_id || '-';
                        const actor = log.actor?.name || log.actor_user_id || '-';
                        const changes: string[] = [];

                        // Fields to ignore in the "Changes" column to keep it clean
                        const ignoreFields = ['id', 'created_at', 'updated_at', 'note', 'is_temporary'];

                        Object.keys(after).forEach((k) => {
                          if (ignoreFields.includes(k)) return;
                          const oldVal = before ? before[k] : '';
                          const newVal = after[k];
                          if (String(oldVal ?? '') !== String(newVal ?? '')) {
                            // If it's a date or timestamp, just show the date part if it matches YYYY-MM-DD
                            const fmt = (v: any) => v && String(v).includes('T') ? new Date(v).toLocaleDateString() : v;
                            changes.push(`${k}: "${fmt(oldVal) ?? ''}" -> "${fmt(newVal) ?? ''}"`);
                          }
                        });

                        const changeText = changes.length ? changes.join('; ') : (after.note || 'No detailed changes recorded');
                        return (
                          <TableRow key={log.id}>
                            <TableCell>{formatDateTime(log.created_at)}</TableCell>
                            <TableCell className="font-medium">{after.full_name || before.full_name || '-'}</TableCell>
                            <TableCell className="text-muted-foreground">{memberId}</TableCell>
                            <TableCell>{actor}</TableCell>
                            <TableCell>{renderActionBadge(log.action_type)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{changeText}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-t bg-muted/50 text-sm text-muted-foreground gap-2">
                <div>
                  Showing {auditFrom || 0}-{auditTo || 0} of {auditTotal} records
                </div>
                <div className="flex w-full sm:w-auto justify-between sm:justify-start gap-2 mt-1 sm:mt-0">
                  <Button variant="outline" size="sm" onClick={() => setHistoryPage((p) => Math.max(1, p - 1))} disabled={historyPage === 1}>
                    Previous
                  </Button>
                  <span className="self-center text-xs sm:text-sm">Page {historyPage} of {auditTotalPages}</span>
                  <Button variant="outline" size="sm" onClick={() => setHistoryPage((p) => Math.min(auditTotalPages, p + 1))} disabled={historyPage === auditTotalPages}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{editingMember ? 'Edit Member' : 'Add New Member'}</CardTitle>
              <Button variant="ghost" size="icon" onClick={closeModal}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveMutation.mutate(formData);
                }}
                className="space-y-6"
              >
                {/* Identification & Status */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Identification & Status</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">CIF Key *</label>
                      <Input
                        value={formData.cif_key}
                        onChange={(e) => setFormData({ ...formData, cif_key: e.target.value })}
                        required
                        disabled={!!editingMember}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Status</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.status}
                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="INACTIVE">INACTIVE</option>
                        <option value="DEACTIVATED">DEACTIVATED</option>
                        <option value="INCOMPLETE">INCOMPLETE</option>
                        <option value="UNKNOWN">UNKNOWN</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Origin Branch *</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.origin_branch_id}
                        onChange={(e) => setFormData({ ...formData, origin_branch_id: e.target.value })}
                        required
                      >
                        <option value="">Select branch</option>
                        {(branches || []).map((b: any) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Personal Information */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Personal Information</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Full Name *</label>
                      <Input value={formData.full_name} onChange={(e) => setFormData({ ...formData, full_name: e.target.value })} required />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Birth Date</label>
                      <Input type="date" value={formData.birth_date} onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Age</label>
                      <Input type="number" value={formData.age} onChange={(e) => setFormData({ ...formData, age: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Sex</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.sex}
                        onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                      >
                        <option value="MALE">MALE</option>
                        <option value="FEMALE">FEMALE</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Civil Status</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.civil_status}
                        onChange={(e) => setFormData({ ...formData, civil_status: e.target.value })}
                      >
                        <option value="">Select status</option>
                        <option value="SINGLE">SINGLE</option>
                        <option value="MARRIED">MARRIED</option>
                        <option value="SEPARATED">SEPARATED</option>
                        <option value="WIDOWED">WIDOWED</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Spouse Name</label>
                      <Input value={formData.spouse_name} onChange={(e) => setFormData({ ...formData, spouse_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Educational Attainment</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.educational_attainment}
                        onChange={(e) => setFormData({ ...formData, educational_attainment: e.target.value })}
                      >
                        <option value="">Select education</option>
                        <option value="No Formal Education">No Formal Education</option>
                        <option value="Elementary Level (Undergraduate)">Elementary Level (Undergraduate)</option>
                        <option value="Elementary Graduate">Elementary Graduate</option>
                        <option value="High School Level (Undergraduate)">High School Level (Undergraduate)</option>
                        <option value="High School Graduate">High School Graduate</option>
                        <option value="Senior High School Level (Undergraduate)">Senior High School Level (Undergraduate)</option>
                        <option value="Senior High School Graduate">Senior High School Graduate</option>
                        <option value="Vocational Course Level (Undergraduate)">Vocational Course Level (Undergraduate)</option>
                        <option value="Vocational Graduate">Vocational Graduate</option>
                        <option value="College Level (Undergraduate)">College Level (Undergraduate)</option>
                        <option value="College Graduate (Bachelor’s Degree)">College Graduate (Bachelor’s Degree)</option>
                        <option value="Postgraduate Level (Undergraduate)">Postgraduate Level (Undergraduate)</option>
                        <option value="Master’s Degree Graduate">Master’s Degree Graduate</option>
                        <option value="Doctorate">Doctorate</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Contact No</label>
                      <Input value={formData.contact_no} onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Address & Contact */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Address & Contact</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Province</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.province}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            province: e.target.value,
                            city_town: '',
                            barangay_village: '',
                          });
                        }}
                      >
                        <option value="">Select Province</option>
                        {(provinces || []).map((p: string) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">City/Town</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.city_town}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            city_town: e.target.value,
                            barangay_village: '',
                          });
                        }}
                        disabled={!formData.province}
                      >
                        <option value="">Select City/Town</option>
                        {(cities || []).map((c: string) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Barangay/Village</label>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={formData.barangay_village}
                        onChange={(e) => setFormData({ ...formData, barangay_village: e.target.value })}
                        disabled={!formData.city_town}
                      >
                        <option value="">Select Barangay</option>
                        {(barangays || []).map((b: string) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Unit/House No.</label>
                      <Input value={formData.unit_house_no} onChange={(e) => setFormData({ ...formData, unit_house_no: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Telephone #</label>
                      <Input value={formData.telephone_no} onChange={(e) => setFormData({ ...formData, telephone_no: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Mobile/Contact #</label>
                      <Input value={formData.contact_no} onChange={(e) => setFormData({ ...formData, contact_no: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Membership & Work */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Membership & Work</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Date of Membership</label>
                      <Input
                        type="date"
                        value={formData.date_of_membership}
                        onChange={(e) => setFormData({ ...formData, date_of_membership: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Position</label>
                      <Input value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Annual Income</label>
                      <Input value={formData.annual_income} onChange={(e) => setFormData({ ...formData, annual_income: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Classification</label>
                      <Input value={formData.classification} onChange={(e) => setFormData({ ...formData, classification: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Membership Type</label>
                      <Input value={formData.membership_type} onChange={(e) => setFormData({ ...formData, membership_type: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Segmentation</label>
                      <Input value={formData.segmentation} onChange={(e) => setFormData({ ...formData, segmentation: e.target.value })} />
                    </div>
                  </div>
                </div>

                {/* Government IDs */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Government IDs</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">TIN</label>
                      <Input value={formData.tin_no} onChange={(e) => setFormData({ ...formData, tin_no: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">SSS No.</label>
                      <Input value={formData.sss_no} onChange={(e) => setFormData({ ...formData, sss_no: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">GSIS No.</label>
                      <Input value={formData.gsis_no} onChange={(e) => setFormData({ ...formData, gsis_no: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-4 border-t">
                  <Button variant="outline" type="button" onClick={closeModal} className="w-full sm:w-auto">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveMutation.isPending} className="w-full sm:w-auto">
                    {saveMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Member
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default MembersPage;
